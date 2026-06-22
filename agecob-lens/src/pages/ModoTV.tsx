import { useNavigate } from "react-router-dom";
import TvMode from "@/components/tv/TvMode";
import { useTvModeViewModel } from "@/hooks/useTvModeViewModel";

/** Rota /modo-tv — painel fullscreen escuro, sem sidebar. */
export default function ModoTV() {
  const navigate = useNavigate();
  const vm = useTvModeViewModel();
  return <TvMode vm={vm} onClose={() => navigate("/")} />;
}
