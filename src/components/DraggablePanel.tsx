import React, { useRef, useState, useEffect, ReactNode } from 'react';

import IconOpen from '~icons/tabler/arrow-badge-down-filled';
import IconClose from '~icons/tabler/arrow-badge-up-filled';

type DraggablePanelProps = {
  header?: ReactNode; // Custom header (drag handle)
  children: ReactNode; // Main panel content
  initialPosition?: { x: number; y: number };
  className?: string; // For custom styling
  panelStyle?: React.CSSProperties; // For custom inline styles
};

export const DraggablePanel: React.FC<DraggablePanelProps> = ({
  header,
  children,
  initialPosition = { x: 32, y: 32 },
  className = '',
  panelStyle = {},
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition);
  const [collapsed, setCollapsed] = useState(false);
  const [resizing, setResizing] = useState<null | string>(null);
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0, left: 0, top: 0, direction: '' });
  const [size, setSize] = useState({ width: 300, height: 400 });
  const [dragging, setDragging] = useState(false);
  // const offset = useRef({ x: 0, y: 0 });

  // Constrain position to viewport bounds
  const constrainPosition = (
    pos: { x: number; y: number },
    panelWidth: number,
    _panelHeight: number
  ) => {
    const margin = 20; // Keep at least 20px visible
    return {
      x: Math.max(margin - panelWidth, Math.min(pos.x, window.innerWidth - margin)),
      y: Math.max(0, Math.min(pos.y, window.innerHeight - margin)),
    };
  };

  const onDragMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      left: position.x,
      top: position.y,
    };
    document.body.style.userSelect = 'none';
  };

  // For resizing from a handle
  const onResizeMouseDown = (e: React.MouseEvent, direction: string) => {
    e.stopPropagation();
    setResizing(direction);
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      left: position.x,
      top: position.y,
      direction,
    };
    document.body.style.userSelect = 'none';
  };

  const dragStart = useRef({ x: 0, y: 0, left: 0, top: 0 });
  const minWidth = 0;
  const minHeight = 0;
  useEffect(() => {
    if (!dragging && !resizing) return;

    const onMouseMove = (e: MouseEvent) => {
      if (dragging) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        const newPos = {
          x: dragStart.current.left + dx,
          y: dragStart.current.top + dy,
        };
        setPosition(constrainPosition(newPos, size.width, size.height));
      } else if (resizing) {
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        let { width, height, left, top } = resizeStart.current;
        let newWidth = width;
        let newHeight = height;
        let newLeft = left;
        let newTop = top;

        switch (resizing) {
          case 'e':
            newWidth = width + dx;
            break;
          case 'w':
            newWidth = width - dx;
            newLeft = left + dx;
            break;
          case 's':
            newHeight = height + dy;
            break;
          case 'n':
            newHeight = height - dy;
            newTop = top + dy;
            break;
          case 'nw':
            newWidth = width - dx;
            newLeft = left + dx;
            newHeight = height - dy;
            newTop = top + dy;
            break;
          case 'ne':
            newWidth = width + dx;
            newHeight = height - dy;
            newTop = top + dy;
            break;
          case 'sw':
            newWidth = width - dx;
            newLeft = left + dx;
            newHeight = height + dy;
            break;
          case 'se':
            newWidth = width + dx;
            newHeight = height + dy;
            break;
          default:
            break;
        }
        // Clamp to minimums and maximums
        newWidth = Math.max(minWidth, Math.min(newWidth, window.innerWidth - 40));
        newHeight = Math.max(minHeight, Math.min(newHeight, window.innerHeight - 40));

        setSize({ width: newWidth, height: newHeight });
        setPosition(constrainPosition({ x: newLeft, y: newTop }, newWidth, newHeight));
      }
    };

    const onMouseUp = () => {
      setDragging(false);
      setResizing(null);
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [dragging, resizing, size.width, size.height]);

  // Handle window resize - reposition panel if it goes off-screen
  useEffect(() => {
    const handleWindowResize = () => {
      setPosition(prev => constrainPosition(prev, size.width, size.height));
    };

    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, [size.width, size.height]);
  return (
    <div
      ref={panelRef}
      className={`fixed z-50 max-h-[80vh] bg-white shadow-xl rounded-lg border border-[rgb(188, 188, 188)] flex flex-col ${className}`}
      style={{
        left: position.x,
        top: position.y,
        right: 'auto',
        bottom: 'auto',
        width: size.width,
        height: collapsed ? undefined : size.height,
        ...panelStyle,
      }}
    >
      <div
        className="cursor-move select-none"
        onMouseDown={onDragMouseDown}
        // You can add more styling or props here if needed
      >
        {' '}
        <div className="p-2 shadow-bottom font-mono font-normal text-[12px] segoe-ui bg-[#e24949] text-white rounded-t-lg flex items-center">
          {/* Custom header content */}
          {header}

          {
            <button
              style={{ marginLeft: 'auto' }}
              onClick={e => {
                e.stopPropagation();
                setCollapsed(prev => !prev);
              }}
              aria-label={collapsed ? 'Expand panel' : 'Collapse panel'}
            >
              {collapsed ? (
                <IconOpen width={24} height={24} />
              ) : (
                <IconClose width={24} height={24} />
              )}
            </button>
          }
        </div>
      </div>

      <div
        className={`panel-content ${collapsed ? 'collapsed' : ''}`}
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
          maxHeight: collapsed ? 0 : 500, // or use a large enough max height
        }}
      >
        <div>{children}</div>

        {/* Corners */}
        <div
          className="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-50"
          onMouseDown={e => onResizeMouseDown(e, 'nw')}
        />
        <div
          className="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-50"
          onMouseDown={e => onResizeMouseDown(e, 'ne')}
        />
        <div
          className="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-50"
          onMouseDown={e => onResizeMouseDown(e, 'sw')}
        />
        <div
          className="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-50"
          onMouseDown={e => onResizeMouseDown(e, 'se')}
        />

        {/* Edges */}
        <div
          className="absolute top-0 left-3 right-3 h-2 cursor-n-resize z-50"
          onMouseDown={e => onResizeMouseDown(e, 'n')}
        />
        <div
          className="absolute bottom-0 left-3 right-3 h-2 cursor-s-resize z-50"
          onMouseDown={e => onResizeMouseDown(e, 's')}
        />
        <div
          className="absolute left-0 top-3 bottom-3 w-2 cursor-w-resize z-50"
          onMouseDown={e => onResizeMouseDown(e, 'w')}
        />
        <div
          className="absolute right-0 top-3 bottom-3 w-2 cursor-e-resize z-50"
          onMouseDown={e => onResizeMouseDown(e, 'e')}
        />
      </div>
    </div>
  );
};

export default DraggablePanel;
