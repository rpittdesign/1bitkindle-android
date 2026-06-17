interface Props {
  visible: boolean;
  onPan: (dir: 'up' | 'down' | 'left' | 'right') => void;
}

const BAR = 'absolute flex items-center justify-center bg-gray-200/60 text-gray-600 font-mono text-xl select-none z-30';

export function PanControls({ visible, onPan }: Props) {
  if (!visible) return null;

  const handle = (dir: 'up' | 'down' | 'left' | 'right') => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onPan(dir);
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-30">
      {/* Top */}
      <div
        className={`${BAR} top-0 left-10 right-10 h-10 pointer-events-auto cursor-pointer`}
        onPointerDown={handle('up')}
      >
        ↑
      </div>
      {/* Bottom */}
      <div
        className={`${BAR} bottom-0 left-10 right-10 h-10 pointer-events-auto cursor-pointer`}
        onPointerDown={handle('down')}
      >
        ↓
      </div>
      {/* Left */}
      <div
        className={`${BAR} left-0 top-10 bottom-10 w-10 pointer-events-auto cursor-pointer`}
        onPointerDown={handle('left')}
      >
        ←
      </div>
      {/* Right */}
      <div
        className={`${BAR} right-0 top-10 bottom-10 w-10 pointer-events-auto cursor-pointer`}
        onPointerDown={handle('right')}
      >
        →
      </div>
    </div>
  );
}
