import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  title: string
}

interface State {
  failed: boolean
}

/** Łapie błąd widoku i nie wypisuje treści dokumentu do konsoli. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    const name = error instanceof Error ? error.name : 'error'
    console.error(`LifeVault: ${name}`)
  }

  render(): ReactNode {
    if (this.state.failed) return <p className="card">{this.props.title}</p>
    return this.props.children
  }
}
