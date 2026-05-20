import { BarChart3, List, Users, UserCheck, TrendingUp, CheckCircle2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import PeriodoFilter from "@/components/PeriodoFilter";
import { useGlobalFilters } from "@/contexts/GlobalFiltersContext";

const navItems = [
  { title: "Produtividade Escritórios", url: "/", icon: TrendingUp, enabled: true },
  { title: "Comparação Agentes", url: "/comparacao-agentes", icon: Users, enabled: true },
  { title: "Detalhamento Agentes", url: "/detalhamento-agentes", icon: UserCheck, enabled: true },
  { title: "Análise de Produtividade", url: "/analise-produtividade", icon: BarChart3, enabled: true },
  { title: "Análise profunda", url: "/analise-profunda", icon: BarChart3, enabled: true },
  { title: "Efetividade de Boletos", url: "/efetividade-boletos", icon: CheckCircle2, enabled: true },
];

export function AppSidebar() {
  const location = useLocation();
  const { category, setCategory, dateFrom, setDateFrom, dateTo, setDateTo } = useGlobalFilters();

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <List className="h-4 w-4 text-sidebar-foreground/70" />
          <span className="text-xs font-semibold uppercase tracking-widest text-sidebar-foreground/70">
            Conteúdo
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {/* Dashboard context */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/logo-empresa.png"
                alt="AgDash"
                className="h-9 w-9 shrink-0 rounded-md object-contain"
              />
              <span className="text-base font-bold text-sidebar-foreground truncate min-w-0" title="AgDash">
                AgDash
              </span>
            </div>
          </div>

          <SidebarGroupLabel className="sr-only">Navegação</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    {item.enabled ? (
                      <SidebarMenuButton asChild isActive={active}>
                        <NavLink
                          to={item.url}
                          end
                          className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                          activeClassName="!bg-primary/10 !text-primary font-medium"
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton
                        disabled
                        className="cursor-not-allowed text-sidebar-foreground/35 opacity-70"
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3 space-y-3 overflow-hidden">
        <div className="space-y-1.5 min-w-0">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            Período
          </span>
          <PeriodoFilter
            inline
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">
            Categoria
          </span>
          <div className="flex gap-1">
            {["Todas", "AUTOS", "CONSUMER"].map((opt) => (
              <Button
                key={opt}
                size="sm"
                variant={category === opt ? "default" : "outline"}
                onClick={() => setCategory(opt)}
                className={
                  category === opt
                    ? "flex-1 h-7 text-xs px-1 bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600"
                    : "flex-1 h-7 text-xs px-1"
                }
              >
                {opt}
              </Button>
            ))}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
