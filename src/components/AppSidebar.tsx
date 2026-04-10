import { BarChart3, List, Users, UserCheck, TrendingUp } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Produtividade Escritórios", url: "/", icon: TrendingUp },
  { title: "Comparação Agentes", url: "/comparacao-agentes", icon: Users },
  { title: "Detalhamento Agentes", url: "/detalhamento-agentes", icon: UserCheck },
  { title: "Análise de Produtividade", url: "/analise-produtividade", icon: BarChart3 },
];

export function AppSidebar() {
  const location = useLocation();

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <List className="h-4 w-4 text-sidebar-foreground/70" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-sidebar-foreground/70">
            Conteúdo
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {/* Dashboard context */}
          <div className="px-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <span className="text-sm font-bold text-sidebar-foreground truncate">
                Dashboard SpecOps Super…
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
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
