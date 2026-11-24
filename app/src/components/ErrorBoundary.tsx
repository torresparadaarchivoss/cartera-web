import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

// Nunca una pantalla en blanco: muestra el error.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="contenido">
          <div className="error-pantalla">
            <strong>No se pudo mostrar esta página.</strong>
            <p>{this.state.error.message}</p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
