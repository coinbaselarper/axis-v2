"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type Track = {
  id: number;
  title: string;
  artist: string;
  album: string;
  artwork: string;
  duration: number;
  explicit?: boolean;
};

type MusicContextValue = {
  active: Track | null;
  playing: boolean;
  progress: number;
  duration: number;
  tracks: Track[];
  pct: number;
  setTracks: (t: Track[]) => void;
  playTrack: (t: Track) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (pct: number) => void;
};

const MusicContext = createContext<MusicContextValue | null>(null);

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const activeIdx = active ? tracks.findIndex((t) => t.id === active.id) : -1;

  const playTrack = (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (active?.id === track.id) {
      setPlaying((p) => !p);
      return;
    }
    setActive(track);
    audio.src = `/api/music/stream?id=${track.id}&artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`;
    audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration);
    const onEnd = () => {
      if (activeIdx >= 0 && activeIdx < tracks.length - 1) {
        playTrack(tracks[activeIdx + 1]);
      } else {
        setPlaying(false);
      }
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
    };
  }, [activeIdx, tracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.play().catch(() => setPlaying(false));
    else audio.pause();
  }, [playing]);

  const togglePlay = () => {
    if (active) setPlaying((p) => !p);
  };

  const next = () => {
    if (activeIdx >= 0 && activeIdx < tracks.length - 1)
      playTrack(tracks[activeIdx + 1]);
  };

  const prev = () => {
    if (activeIdx > 0) playTrack(tracks[activeIdx - 1]);
  };

  const seek = (pct: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = pct * duration;
    setProgress(audio.currentTime);
  };

  const pct = useMemo(
    () => (duration ? (progress / duration) * 100 : 0),
    [progress, duration],
  );

  return (
    <MusicContext.Provider
      value={{
        active,
        playing,
        progress,
        duration,
        tracks,
        pct,
        setTracks,
        playTrack,
        togglePlay,
        next,
        prev,
        seek,
      }}
    >
      {children}
      <audio ref={audioRef} preload="metadata" />
    </MusicContext.Provider>
  );
}

export function useMusicPlayer() {
  const ctx = useContext(MusicContext);
  if (!ctx) throw new Error("useMusicPlayer must be used within MusicProvider");
  return ctx;
}
