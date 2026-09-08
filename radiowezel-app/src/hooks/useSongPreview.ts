import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { extractYoutubeVideoId, youtubeEmbedPreviewUrl } from "@/lib/youtube";
import { useToast } from "@/hooks/use-toast";

const PREVIEW_SECONDS = 30;
const FADE_IN_DURATION = 0.3;
const FADE_OUT_DURATION = 1.5;
const YOUTUBE_PREVIEW_START = 25;

export function useSongPreview() {
  const [previewSongId, setPreviewSongId] = useState<string | null>(null);
  const [youtubeEmbedUrl, setYoutubeEmbedUrl] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const youtubeStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();

  const stopPreview = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    if (youtubeStopRef.current) {
      clearTimeout(youtubeStopRef.current);
      youtubeStopRef.current = null;
    }
    setYoutubeEmbedUrl(null);
    setPreviewSongId(null);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const playFilePreview = useCallback(
    async (songId: string, requestedStartTime = 25) => {
      if (previewSongId === songId && previewAudioRef.current) {
        stopPreview();
        return;
      }

      stopPreview();
      setPreviewSongId(songId);

      try {
        const url = await api.getSongFileBlobUrl(songId);
        previewUrlRef.current = url;

        const audio = new Audio(url);
        previewAudioRef.current = audio;
        audio.crossOrigin = "anonymous";

        audio.addEventListener(
          "loadedmetadata",
          async () => {
            const duration = audio.duration;
            let startTime = requestedStartTime;
            let previewDuration = PREVIEW_SECONDS;

            if (duration <= requestedStartTime) {
              startTime = 0;
              previewDuration = Math.min(PREVIEW_SECONDS, duration);
            } else if (duration < startTime + PREVIEW_SECONDS) {
              previewDuration = duration - startTime;
            }

            audio.currentTime = startTime;

            const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            const audioContext = AudioContextCtor ? new AudioContextCtor() : null;
            const gainNode = audioContext?.createGain() ?? null;
            if (audioContext && gainNode) {
              const source = audioContext.createMediaElementSource(audio);
              source.connect(gainNode);
              gainNode.connect(audioContext.destination);
              const now = audioContext.currentTime;
              gainNode.gain.setValueAtTime(0, now);
              gainNode.gain.linearRampToValueAtTime(1, now + FADE_IN_DURATION);
              const fadeOutStartTime = previewDuration - FADE_OUT_DURATION;
              if (fadeOutStartTime > FADE_IN_DURATION) {
                gainNode.gain.setValueAtTime(1, now + fadeOutStartTime);
                gainNode.gain.linearRampToValueAtTime(0, now + previewDuration);
              } else {
                gainNode.gain.setValueAtTime(1, now + Math.max(0, previewDuration - 0.2));
                gainNode.gain.linearRampToValueAtTime(0, now + previewDuration);
              }
            }

            audio.onended = () => stopPreview();
            audio.onerror = () => {
              toast({ title: "Błąd odtwarzania", variant: "destructive" });
              stopPreview();
            };

            await audio.play();
            setTimeout(() => stopPreview(), previewDuration * 1000);
          },
          { once: true },
        );
      } catch {
        toast({ title: "Nie można odtworzyć zajawki", variant: "destructive" });
        setPreviewSongId(null);
      }
    },
    [previewSongId, stopPreview, toast],
  );

  const playYoutubePreview = useCallback(
    (songId: string, youtubeUrl: string) => {
      if (previewSongId === songId && youtubeEmbedUrl) {
        stopPreview();
        return;
      }
      const videoId = extractYoutubeVideoId(youtubeUrl);
      if (!videoId) {
        toast({ title: "Nie można odtworzyć zajawki", variant: "destructive" });
        return;
      }
      stopPreview();
      setPreviewSongId(songId);
      setYoutubeEmbedUrl(youtubeEmbedPreviewUrl(videoId, YOUTUBE_PREVIEW_START));
      youtubeStopRef.current = setTimeout(() => stopPreview(), PREVIEW_SECONDS * 1000);
    },
    [previewSongId, stopPreview, toast, youtubeEmbedUrl],
  );

  return { previewSongId, youtubeEmbedUrl, playFilePreview, playYoutubePreview };
}
