import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Error de interfaz capturado:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-beige-100 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-500/10 text-danger-500">
            <AlertTriangle size={28} />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-ink-900">Algo salió mal</h1>
            <p className="mt-1 max-w-sm text-sm text-ink-500">
              Ocurrió un error inesperado en esta pantalla. Tus datos no se han perdido; intenta recargar.
            </p>
          </div>
          <Button onClick={() => window.location.reload()}>Recargar</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
