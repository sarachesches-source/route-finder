// Small line icons used across the interface (24x24 grid, drawn with the current text colour).
const base = {
  width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true,
};
const icon = (paths) => function Icon({ size = 16, ...props }) {
  return <svg {...base} width={size} height={size} {...props}>{paths}</svg>;
};

export const LogoIcon = icon(<>
  <path d="M3 20 9.5 8l4 7 2.5-4L21 20Z" />
  <path d="M8 20c2-2.5 5-3 8-1.5" />
</>);
export const PinIcon = icon(<>
  <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z" />
  <circle cx="12" cy="10" r="2.3" />
</>);
export const LocateIcon = icon(<>
  <circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.5" />
  <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
</>);
export const MountainIcon = icon(<path d="M3 19 9.5 7l4 7 2-3L21 19Z" />);
export const RulerIcon = icon(<>
  <path d="M3 16 16 3l5 5L8 21Z" /><path d="m7 12 2 2M10 9l2 2M13 6l2 2" />
</>);
export const DropIcon = icon(<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z" />);
export const UploadIcon = icon(<>
  <path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
</>);
export const DownloadIcon = icon(<>
  <path d="M12 4v12M7 11l5 5 5-5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
</>);
export const SearchIcon = icon(<><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>);
export const AlertIcon = icon(<>
  <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" />
  <path d="M12 9.5v4M12 17h.01" />
</>);
export const CheckIcon = icon(<path d="m5 12.5 4.5 4.5L19 7.5" />);
export const CrossIcon = icon(<path d="M6 6l12 12M18 6 6 18" />);
export const FlagIcon = icon(<><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>);
export const ChevronIcon = icon(<path d="m9 6 6 6-6 6" />);
export const HomeIcon = icon(<><path d="M4 11 12 4l8 7" /><path d="M6 10v10h12V10" /></>);
