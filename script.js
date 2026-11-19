document.addEventListener("DOMContentLoaded", async () => {
    async function updateCount(method) {
        try {
            const response = await fetch("/api/conversions", { method, cache: "no-store" });
            if (!response.ok) return;
            const { conversions } = await response.json();
            if (!Number.isSafeInteger(conversions) || conversions < 0) return;
            const count = document.getElementById("conversion-count");
            count.textContent = Math.max(Number(count.dataset.total || 0), conversions).toLocaleString();
            count.dataset.total = Math.max(Number(count.dataset.total || 0), conversions);
            document.getElementById("conversion-total").hidden = false;
        } catch { /* The optional counter must never interrupt conversion. */ }
    }
    updateCount("GET");

    if (typeof FFmpeg === "undefined") {
        alert("FFmpeg failed to load.");
        return;
    }

    const { createFFmpeg, fetchFile } = FFmpeg;

    let activeJob;
    let generatedVideoData;
    let fileName;

    const imageInput = document.getElementById("image");
    const audioInput = document.getElementById("audio");
    const convertBtn = document.getElementById("convert");
    const cancelBtn = document.getElementById("cancelBtn");
    const saveBtn = document.getElementById("saveBtn");
    const progressBar = document.getElementById("progress-bar");
    const status = document.getElementById("status");
    const resolutionSelect = document.getElementById("resolution");
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const MOBILE_MAX_DURATION = 60 * 60 * 3;      // 3 hours
    const MOBILE_MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

    const dropOverlay = document.getElementById("drop-overlay");

    window.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer.types.includes("Files")) dropOverlay.style.display = "flex";
    });

    window.addEventListener("dragleave", (e) => {
        if (!e.relatedTarget) {
            dropOverlay.style.display = "none";
        }
    });

    window.addEventListener("drop", (e) => {
        e.preventDefault();
        dropOverlay.style.display = "none";

        const files = e.dataTransfer.files;

        for (const file of files) {

            if (file.type.startsWith("audio")) {
                const dt = new DataTransfer();
                dt.items.add(file);
                audioInput.files = dt.files;

                document.getElementById("audio-label-text").innerText =
                    "🎵 " + file.name;
            }

            if (file.type.startsWith("image")) {
                const dt = new DataTransfer();
                dt.items.add(file);
                imageInput.files = dt.files;

                imageInput.dispatchEvent(new Event("change"));
            }

        }
    });

    const preview = document.getElementById("cover-preview");
    let previewUrl;
    preview.onload = () => { preview.hidden = false; };
    preview.onerror = () => { preview.hidden = true; };
    imageInput.addEventListener("change", () => {
        preview.hidden = true;
        preview.removeAttribute("src");
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = null;
        if (imageInput.files && imageInput.files[0]) {
            previewUrl = URL.createObjectURL(imageInput.files[0]);
            preview.src = previewUrl;
            document.getElementById("image-label-text").innerText =
                "🖼 " + imageInput.files[0].name;
        } else {
            document.getElementById("image-label-text").innerText =
                "Choose cover (optional)";
        }
    });

    audioInput.addEventListener("change", () => {
        if (audioInput.files && audioInput.files[0]) {
            document.getElementById("audio-label-text").innerText =
                "🎵 " + audioInput.files[0].name;
        } else {
            document.getElementById("audio-label-text").innerText =
                "Choose audio";
        }
    });
    function showBusy(busy) {
        convertBtn.disabled = busy;
        cancelBtn.style.display = busy ? "inline-block" : "none";
        document.getElementById("progress-box").style.display = busy ? "block" : "none";
    }

    async function getAudioDuration(file, signal) {
        const url = URL.createObjectURL(file);
        const audio = document.createElement("audio");
        let timer;
        let cancel;
        try {
            return await new Promise((resolve, reject) => {
                cancel = () => reject(new Error("Canceled."));
                signal.addEventListener("abort", cancel);
                audio.onerror = () => reject(new Error("Could not read this audio file."));
                timer = setTimeout(audio.onerror, 30000);
                audio.onloadedmetadata = () => {
                    if (Number.isFinite(audio.duration) && audio.duration > 0) resolve(audio.duration);
                    else audio.onerror();
                };
                audio.src = url;
            });
        } finally {
            clearTimeout(timer);
            signal.removeEventListener("abort", cancel);
            audio.onerror = audio.onloadedmetadata = null;
            audio.removeAttribute("src");
            audio.load();
            URL.revokeObjectURL(url);
        }
    }

    function formatTime(sec) {
        sec = Math.max(0, sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    }

    function getAdaptiveFPS(duration) {
        let fps;
        if (duration < 3600) {
            fps = 0.7;
        } else if (duration < 7200) {
            fps = 0.3;
        } else {
            fps = 0.2;
        }
        // Mobile cap
        if (isMobile) {
            fps = Math.min(fps, 0.3); // Never above 0.4 on mobile
        }
        return fps;
    }
    convertBtn.addEventListener("click", async () => {

        const audioFile = audioInput.files[0];
        const imageFile = imageInput.files[0];

        if (activeJob) return;
        if (!audioFile) {
            status.textContent = "Choose an audio file to convert.";
            return;
        }

        const controller = new AbortController();
        const signal = controller.signal;
        let ffmpeg;
        activeJob = { controller, stopEncoder() { if (ffmpeg?.isLoaded()) ffmpeg.exit(); } };
        showBusy(true);
        generatedVideoData = null;
        saveBtn.style.display = "none";
        progressBar.style.width = "0%";
        const width = isMobile ? 1280 : Number(resolutionSelect.value);
        const height = width * 9 / 16;
        try {
            status.textContent = "Reading audio…";
            if (imageFile && /\.hei[cf]$/i.test(imageFile.name)) throw new Error("Please convert the image to JPG or PNG first.");
            if (isMobile && audioFile.size > MOBILE_MAX_FILE_SIZE) throw new Error("Audio exceeds the 200 MB mobile limit.");
            const audioDuration = await getAudioDuration(audioFile, signal);
            signal.throwIfAborted();
            if (isMobile && audioDuration > MOBILE_MAX_DURATION) throw new Error("Audio exceeds the 3 hour mobile limit.");
            status.textContent = "Loading encoder…";
            ffmpeg = createFFmpeg({
                log: true,
                corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
            });
            await ffmpeg.load();
            signal.throwIfAborted();
            const adaptiveFPS = getAdaptiveFPS(audioDuration);
            status.innerText = `Using ${adaptiveFPS} FPS for optimized encoding...`;

            ffmpeg.setLogger(({ type, message }) => {
                if (!signal.aborted && type === "fferr") {
                    const timeMatch = message.match(/time=([0-9:.]+)/);
                    const speedMatch = message.match(/speed=\s*([0-9.]+)x/);

                    if (timeMatch) {
                        const parts = timeMatch[1].split(":");
                        const seconds =
                            parseInt(parts[0]) * 3600 +
                            parseInt(parts[1]) * 60 +
                            parseFloat(parts[2]);

                        const percent = Math.min(
                            100,
                            (seconds / audioDuration) * 100
                        );

                        progressBar.style.width = percent.toFixed(1) + "%";

                        let etaText = "";
                        if (speedMatch && Number(speedMatch[1]) > 0) {
                            const speed = parseFloat(speedMatch[1]);
                            const remaining = audioDuration - seconds;
                            const eta = remaining / speed;
                            etaText = " | ETA: " + formatTime(eta);
                        }

                        status.innerText =
                            `Processing... ${percent.toFixed(1)}%${etaText}`;
                    }
                }
            });

            const audioExt = audioFile.name.split(".").pop().toLowerCase();
            const audioName = "input." + audioExt;
            ffmpeg.FS("writeFile", audioName, await fetchFile(audioFile));

            signal.throwIfAborted();
            const imageName = "cover";
            const cover = imageFile || await fetch("default.png", { signal }).then(response => {
                if (!response.ok) throw new Error("Could not load the default cover.");
                return response.blob();
            });
            ffmpeg.FS("writeFile", imageName, await fetchFile(cover));
            signal.throwIfAborted();

            const canCopyAudio = ["mp3", "aac", "m4a"].includes(audioExt);
            const audioCodecArgs = canCopyAudio
                ? ["-c:a", "copy"]
                : ["-c:a", "aac", "-b:a", "96k"];
            await ffmpeg.run(
                "-threads", "1",
                "-loop", "1",
                "-framerate", adaptiveFPS.toString(),
                "-i", imageName,
                "-i", audioName,
                "-r", adaptiveFPS.toString(),  // force output fps
                "-map", "0:v:0", "-map", "1:a:0",
                "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "30",
                "-tune", "stillimage",
                ...audioCodecArgs,
                "-t", String(Math.ceil(audioDuration * adaptiveFPS) / adaptiveFPS),
                "-pix_fmt", "yuv420p",
                "-g", "999999",
                "output.mp4"
            );

            signal.throwIfAborted();
            generatedVideoData = ffmpeg.FS("readFile", "output.mp4");

            if (!generatedVideoData.length) throw new Error("The encoder produced an empty video.");
            fileName = audioFile.name.replace(/\.[^/.]+$/, "") + "_video.mp4";
            updateCount("POST");
            progressBar.style.width = "100%";
            status.innerText = "Conversion complete!";
            saveBtn.style.display = "inline-block";

        } catch (error) {
            if (!signal.aborted) status.textContent = error.message || "Conversion failed. Check the audio and image files.";
        } finally {
            if (ffmpeg?.isLoaded()) ffmpeg.exit();
            if (!signal.aborted) {
                activeJob = null;
                showBusy(false);
            }
        }
    });

    cancelBtn.addEventListener("click", () => {
        if (!activeJob) return;
        activeJob.controller.abort();
        activeJob.stopEncoder();
        activeJob = null;
        showBusy(false);
        status.textContent = "Canceled.";
    });

    saveBtn.addEventListener("click", async () => {
        const video = generatedVideoData;
        if (!video) return;
        try {
            // Modern Chrome
            if ("showSaveFilePicker" in window) {

                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{
                        description: "MP4 Video",
                        accept: { "video/mp4": [".mp4"] }
                    }]
                });

                const writable = await handle.createWritable();
                await writable.write(video);
                await writable.close();

            } else {
                // Fallback for Safari / Firefox / unsupported browsers
                const blob = new Blob([video], {
                    type: "video/mp4"
                });

                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = fileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                setTimeout(() => URL.revokeObjectURL(link.href), 1000);
            }
        } catch (error) {
            if (error.name !== "AbortError") status.textContent = "Could not save the video. Try saving again.";
        }
    });

});