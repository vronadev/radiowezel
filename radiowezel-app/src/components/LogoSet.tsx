import orlenLogo from "../assets/orlen.png";
import inzynierowieLogo from "../assets/inzynierowie.png";
import switchLogo from "../assets/switch.png";
import zsiLogo from "../assets/zsi.png";
import { useTheme } from "../context/ThemeContext";

export function LogoSet({ variant }: { variant: "header" | "footer" }) {
  const { theme } = useTheme();
  const logoStyle = {
    filter: theme === "light" ? "invert(1)" : "none",
  };

  if (variant === "footer") {
    return (
      <div className="md:hidden flex flex-col items-center gap-6 py-6">
        <img src={orlenLogo} alt="Logo ORLEN" className="h-28 w-auto object-contain" style={logoStyle} />
        <img src={inzynierowieLogo} alt="Logo Inżynierowie" className="h-28 w-auto object-contain" style={logoStyle} />
        <img src={switchLogo} alt="Logo Switch" className="h-20 w-auto object-contain" style={logoStyle} />
        <img src={zsiLogo} alt="Logo ZSI" className="h-28 w-auto object-contain" style={logoStyle} />
      </div>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-5 h-20">
      <img src={orlenLogo} alt="Logo ORLEN" className="object-cover h-64" style={logoStyle} />
      <img src={inzynierowieLogo} alt="Logo Inżynierowie" className="object-cover h-64" style={logoStyle} />
      <img src={switchLogo} alt="Logo Switch" className="object-cover h-40" style={logoStyle} />
      <img src={zsiLogo} alt="Logo ZSI" className="object-cover h-64" style={logoStyle} />
    </div>
  );
}

export default LogoSet;
