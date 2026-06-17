import { useRef, useEffect } from 'react';

interface Props {
  size?: number;
  render: (canvas: HTMLCanvasElement) => void;
  active?: boolean;
  onClick?: () => void;
}

export function PreviewTile({ size = 20, render, active = false, onClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) render(canvasRef.current);
  }, [render]);

  return (
    <button
      onClick={onClick}
      className={`border border-foreground p-0.5 ${active ? 'bg-foreground' : 'bg-background'}`}
    >
      <canvas
        ref={canvasRef}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          imageRendering: 'pixelated',
          display: 'block',
          filter: active ? 'invert(1)' : 'none',
        }}
      />
    </button>
  );
}
