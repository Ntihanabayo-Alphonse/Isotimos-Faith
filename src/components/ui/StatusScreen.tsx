import { Link } from 'react-router'
import { Cross } from 'lucide-react'

export function StatusScreen({ title, message, loading = false }: { title: string; message?: string; loading?: boolean }) {
  return <main className="status-screen" aria-busy={loading}>
    <div className="brand-mark"><Cross size={24} /></div>
    <h1>{title}</h1><p role={loading ? 'status' : undefined}>{message}</p>
    {!loading && <Link className="btn btn-primary" to="/app">Back to your feed</Link>}
  </main>
}
