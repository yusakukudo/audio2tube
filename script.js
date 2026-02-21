document.addEventListener("DOMContentLoaded", async () => {

    if (typeof FFmpeg === "undefined") {
        alert("FFmpeg failed to load.");
        return;
    }

    const { createFFmpeg, fetchFile } = FFmpeg;

    let ffmpeg = createFFmpeg({
        log: true,
        corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
    });

    let generatedVideoData = null;
    let isProcessing = false;
    let audioDuration = 0;

    const imageInput = document.getElementById("image");
    const audioInput = document.getElementById("audio");
    const convertBtn = document.getElementById("convert");
    const cancelBtn = document.getElementById("cancelBtn");
    const saveBtn = document.getElementById("saveBtn");
    const progressBar = document.getElementById("progress-bar");
    const status = document.getElementById("status");
    const resolutionSelect = document.getElementById("resolution");
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const MOBILE_MAX_DURATION = 60 * 60 * 3;      // 1 hour
    const MOBILE_MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB


    imageInput.addEventListener("change", () => {
        if (imageInput.files && imageInput.files[0]) {
            document.getElementById("image-label-text").innerText =
                "🖼 " + imageInput.files[0].name;
        } else {
            document.getElementById("image-label-text").innerText =
                "🖼 Upload Image";
        }
    });

    audioInput.addEventListener("change", () => {
        if (audioInput.files && audioInput.files[0]) {
            document.getElementById("audio-label-text").innerText =
                "🎵 " + audioInput.files[0].name;
        } else {
            document.getElementById("audio-label-text").innerText =
                "🎵 Upload Audio";
        }
    });
    function resetUI() {
        progressBar.style.width = "0%";
        cancelBtn.style.display = "none";
        convertBtn.disabled = false;
        isProcessing = false;
    }

    async function getAudioDuration(file) {
        return new Promise(resolve => {
            const audio = document.createElement("audio");
            audio.src = URL.createObjectURL(file);
            audio.onloadedmetadata = () => resolve(audio.duration);
        });
    }

    function formatTime(sec) {
        sec = Math.max(0, sec);
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m ${s}s`;
    }

    async function resizeImage(file, maxWidth) {
        return new Promise(resolve => {
            const img = new Image();
            img.src = URL.createObjectURL(file);

            img.onload = () => {
                const scale = Math.min(1, maxWidth / img.width);

                const canvas = document.createElement("canvas");
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;

                const ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                canvas.toBlob(blob => resolve(blob), "image/jpeg", 0.85);
            };
        });
    }
    function getAdaptiveFPS(duration) {
        let fps;
        if (duration < 3600) {
            fps = 0.8;
        } else if (duration < 7200) {
            fps = 0.4;
        } else {
            fps = 0.25;
        }
        // Mobile cap
        if (isMobile) {
            fps = Math.min(fps, 0.4); // Never above 0.4 on mobile
        }
        return fps;
    }
    convertBtn.addEventListener("click", async () => {

        const audioFile = audioInput.files[0];
        const imageFile = imageInput.files[0];

        if (!audioFile || isProcessing) return;

        isProcessing = true;
        convertBtn.disabled = true;
        cancelBtn.style.display = "inline-block";
        saveBtn.style.display = "none";
        progressBar.style.width = "0%";
        status.innerText = "Loading...";

        if (imageFile) {

            const imageExt = imageFile.name.split(".").pop().toLowerCase();

            if (imageExt === "heic" || imageExt === "heif") {

                status.innerText = "HEIC format is not supported.";

                alert(
                    "HEIC / HEIF images are not supported.\n\n" +
                    "Please convert the image to JPG or PNG before uploading.\n\n" +
                    "Tip (iPhone): Settings → Camera → Formats → Select 'Most Compatible'."
                );

                resetUI();
                return;
            }
        }
        if (!ffmpeg.isLoaded()) {
            await ffmpeg.load();
        }

        audioDuration = await getAudioDuration(audioFile);
        if (isMobile) {

            if (audioDuration > MOBILE_MAX_DURATION) {
                const maxHours = MOBILE_MAX_DURATION / 3600;
                alert(`On mobile devices, maximum supported duration is ${maxHours} hour.`);
                resetUI();
                return;
            }

            if (audioFile.size > MOBILE_MAX_FILE_SIZE) {
                alert("Audio file too large for mobile device.");
                resetUI();
                return;
            }

            // Force 720p on mobile
            resolutionSelect.value = "1280";

            status.innerText = "Mobile mode: Optimized for stability.";
        }
        const adaptiveFPS = getAdaptiveFPS(audioDuration);
        status.innerText = `Using ${adaptiveFPS} FPS for optimized encoding...`;

        ffmpeg.setLogger(({ type, message }) => {
            if (type === "fferr") {
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
                    if (speedMatch) {
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

        const selectedWidth = parseInt(resolutionSelect.value);
        let imageName = "image.jpg";

        if (imageFile) {
            status.innerText = "Optimizing image...";
            const resizedBlob = await resizeImage(imageFile, selectedWidth);
            ffmpeg.FS("writeFile", imageName, await fetchFile(resizedBlob));
        } else {
            const response = await fetch("default.png");
            const buffer = await response.arrayBuffer();
            ffmpeg.FS("writeFile", imageName, new Uint8Array(buffer));
        }
        
        const canCopyAudio = ["mp3", "aac", "m4a"].includes(audioExt);
        const audioCodecArgs = canCopyAudio
            ? ["-c:a", "copy"]
            : ["-c:a", "aac", "-b:a", "96k"];
        try {
            await ffmpeg.run(
                "-threads", "1",
                "-loop", "1",
                "-framerate", adaptiveFPS.toString(),
                "-i", imageName,
                "-i", audioName,
                "-r", adaptiveFPS.toString(),  // force output fps
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "30",
                "-tune", "stillimage",
                "-c:a", "aac",
                "-b:a", "96k",
                "-pix_fmt", "yuv420p",
                "-shortest",
                "-g", "999999",
                "output.mp4"
            );

            generatedVideoData = ffmpeg.FS("readFile", "output.mp4");

            progressBar.style.width = "100%";
            status.innerText = "Conversion complete!";
            saveBtn.style.display = "inline-block";

        } catch {
            status.innerText = "Processing canceled.";
        }

        try {
            ffmpeg.FS("unlink", audioName);
            ffmpeg.FS("unlink", imageName);
            ffmpeg.FS("unlink", "output.mp4");
        } catch {}

        resetUI();
    });

    cancelBtn.addEventListener("click", async () => {
        if (!isProcessing) return;
        status.innerText = "Canceling...";

        try { await ffmpeg.exit(); } catch {}

        ffmpeg = createFFmpeg({
            log: true,
            corePath: "https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js",
        });

        resetUI();
        status.innerText = "Canceled.";
    });

    saveBtn.addEventListener("click", async () => {
        if (!generatedVideoData) return;

        const audioFile = audioInput.files[0];
        const base = audioFile
            ? audioFile.name.replace(/\.[^/.]+$/, "")
            : "audio2tube";

        const fileName = base + "_video.mp4";

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
            await writable.write(generatedVideoData);
            await writable.close();

        } else {
            // Fallback for Safari / Firefox / unsupported browsers
            const blob = new Blob([generatedVideoData.buffer], {
                type: "video/mp4"
            });

            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(link.href);
        }
    });

});