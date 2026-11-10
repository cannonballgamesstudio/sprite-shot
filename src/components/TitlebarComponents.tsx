
import React, { useRef, useEffect } from "react";

type MenuButtonProps = {
    children: React.ReactNode;
    onClick?: () => void;
  };
  
const MenuButton = React.forwardRef<HTMLButtonElement, MenuButtonProps>(
    ({ children, onClick }, ref) => (
    <button className="transition-colors duration-300 bg-transparent border-none h-[30px] cursor-pointer font-mono font-normal text-[12px] outline-none shadow-none" onClick={onClick} ref={ref}>
    <span className="inline-block px-2 rounded hover:bg-[rgba(157,157,157,0.5)] transition-colors duration-300 segoe-ui">{children}</span>
    </button>
    )
);

type TitlebarIconButtonProps = {
  children: React.ReactNode; // The icon component
  onClick?: () => void;
  title?: string;
  className?: string;
  hoverBg?: string; // e.g. "hover:bg-gray-300", "hover:bg-red-500 hover:bg-opacity-70"
};

const TitlebarIconButton: React.FC<TitlebarIconButtonProps> = ({
  children,
  onClick,
  title,
  className = "",
  hoverBg = "hover:bg-[#C1C5FD]",
}) => (
  <button
    type="button"
    tabIndex={-1}
    title={title}
    onClick={onClick}
    className={`group h-[35px] w-[45px] flex items-center justify-center transition-colors duration-200 ${hoverBg} ${className}`}
  >
    {children}
  </button>
);

type MenuListProps = {
    open: boolean;
    onClose: () => void;
    anchorRef: React.RefObject<HTMLButtonElement>;
    children: React.ReactNode;
    className?: string;
  };
  
const MenuList: React.FC<MenuListProps> = ({ open, onClose, anchorRef, children, className = "" }) => {
    const menuRef = useRef<HTMLDivElement>(null);
  
    // Close menu if clicked outside
    useEffect(() => {
      if (!open) return;
      function handleClick(e: MouseEvent) {
        if (
          menuRef.current &&
          !menuRef.current.contains(e.target as Node) &&
          anchorRef.current &&
          !anchorRef.current.contains(e.target as Node)
        ) {
          onClose();
        }
      }
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }, [open, onClose, anchorRef]);
  
    // Position menu below anchor
    const [style, setStyle] = React.useState<React.CSSProperties>({});
    useEffect(() => {
      if (open && anchorRef.current && menuRef.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setStyle({
          position: "absolute",
          top: rect.bottom + 1,
          left: rect.left,
          minWidth: rect.width,
          zIndex: 1,
        });
      }
    }, [open, anchorRef]);
  
    if (!open) return null;
  
    return (
      <div
        ref={menuRef}
        style={style}
        className={`bg-[#FDFBC7] border border-gray-300 rounded shadow-lg py-1 w-[150px] ${className}`}
      >
        {children}
      </div>
    );
  };

export { MenuButton, TitlebarIconButton, MenuList };
