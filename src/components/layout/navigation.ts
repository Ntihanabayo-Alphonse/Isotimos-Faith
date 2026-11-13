import { BookOpen, Bookmark, CircleUserRound, House, LayoutGrid, MessageCircle, NotebookPen, Settings, Users } from 'lucide-react'

export const navigation = [
  { label: 'Home feed', path: '', icon: House },
  { label: 'My profile', path: '/profile', icon: CircleUserRound },
  { label: 'Discover people', path: '/people', icon: Users },
  { label: 'Devotionals', path: '/devotionals', icon: BookOpen },
  { label: 'Categories', path: '/categories', icon: LayoutGrid },
  { label: 'Saved', path: '/saved', icon: Bookmark },
  { label: 'My content', path: '/my-content', icon: NotebookPen },
  { label: 'Messages', path: '/messages', icon: MessageCircle },
  { label: 'Settings', path: '/settings', icon: Settings },
]
