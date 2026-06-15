import { LayoutDashboard, Users, TrendingUp, Target } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Dashboard Executivo", url: "/", icon: LayoutDashboard, enabled: true, level: 1 },
  { title: "Detalhamento Agentes", url: "/detalhamento-agentes", icon: Users, enabled: true, level: 2 },
  { title: "Carteiras — Metas", url: "/carteiras", icon: Target, enabled: true, level: 2 },
  { title: "Análise & Efetividade", url: "/efetividade-boletos", icon: TrendingUp, enabled: true, level: 3 },
];

const LEVEL_LABELS: Record<number, string> = {
  1: "Síntese",
  2: "Análise",
  3: "Detalhe",
};

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-4 pt-5 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/logo-empresa.png"
            alt="AgDash"
            className="h-8 w-8 shrink-0 rounded-md object-contain"
          />
          <div className="flex flex-col min-w-0 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-[15px] font-bold text-sidebar-foreground truncate" title="AgDash">
              AgDash
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              Executivo
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="sr-only">Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item, idx) => {
                const active = location.pathname === item.url;
                const prevLevel = idx > 0 ? navItems[idx - 1].level : 0;
                const showLevelLabel = item.level !== prevLevel;
                return (
                  <div key={item.title}>
                    {showLevelLabel && (
                      <div
                        className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 group-data-[collapsible=icon]:hidden"
                      >
                        {LEVEL_LABELS[item.level]}
                      </div>
                    )}
                    <SidebarMenuItem>
                      {item.enabled ? (
                        <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                          <NavLink
                            to={item.url}
                            end
                            className="text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                            activeClassName="!bg-sidebar-accent !text-sidebar-foreground font-semibold"
                          >
                            <item.icon className="h-4 w-4" />
                            <span>{item.title}</span>
                          </NavLink>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          disabled
                          className="cursor-not-allowed text-slate-400 opacity-70"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  </div>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col gap-0.5">
          <span
            className="text-[10px] font-mono font-medium text-slate-400"
            title="Versão do dashboard"
          >
            v{__COMMIT_SHA__}
          </span>
          <span className="text-[11px] font-medium text-slate-400">
            Grupo Agecob
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
