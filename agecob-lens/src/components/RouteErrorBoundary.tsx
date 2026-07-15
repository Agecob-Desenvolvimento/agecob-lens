import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { captureError } from "@/services/analytics";
import { reloadOnChunkError } from "@/lib/chunkErrorRecovery";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  routeName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, State> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[RouteErrorBoundary${this.props.routeName ? `:${this.props.routeName}` : ""}]`, error, info.componentStack);
    captureError(error, { routeName: this.props.routeName, componentStack: info.componentStack });

    reloadOnChunkError(error);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const route = this.props.routeName ?? "desconhecida";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Erro na página
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A página <span className="font-mono text-foreground">{route}</span> encontrou um erro inesperado.
            </p>
            {this.state.error && (
              <pre className="text-xs bg-muted rounded-md p-3 overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <Button onClick={this.handleRetry} size="sm" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
}
