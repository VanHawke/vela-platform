// src/pages/preview/HomePreview.jsx — shadcn-based mockup of new Home
// Uses canonical shadcn primitives. Tailwind classes only. No inline styles.
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TrendingUp, Target, AlertTriangle, Calendar, Bell, Plus, Mic, Send } from 'lucide-react'

export default function HomePreview() {
  return (
    <div className="min-h-screen bg-background text-foreground p-8">
      <div className="max-w-6xl mx-auto space-y-12">

        {/* Hero greeting */}
        <div className="flex flex-col items-center text-center space-y-4 pt-12">
          <div className="flex items-end gap-1 h-12 mb-4">
            {[12, 24, 36, 48, 32, 20, 28, 40, 24, 16].map((h, i) => (
              <div key={i} className="w-1 bg-primary rounded-full" style={{ height: `${h}px` }} />
            ))}
          </div>
          <h1 className="text-5xl font-semibold tracking-tight">Good afternoon, Sunny</h1>
          <p className="text-lg text-muted-foreground">What would you like to work on?</p>
        </div>

        <Card className="max-w-3xl mx-auto p-2 flex items-center gap-2">
          <Button variant="ghost" size="icon" className="rounded-full bg-primary/10 text-primary hover:bg-primary/20">
            <Plus className="h-4 w-4" />
          </Button>
          <input
            type="text"
            placeholder="Ask me anything..."
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground px-2"
          />
          <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-foreground">
            <Mic className="h-4 w-4" />
          </Button>
          <Button size="icon" className="rounded-full">
            <Send className="h-4 w-4" />
          </Button>
        </Card>

        {/* Suggested chips */}
        <div className="flex flex-wrap items-center justify-center gap-3 max-w-3xl mx-auto">
          <Button variant="outline" size="sm" className="rounded-full">
            <Bell className="h-3 w-3" /> 188 alerts
          </Button>
          <Button variant="outline" size="sm" className="rounded-full">
            19 overdue tasks
          </Button>
          <Button variant="outline" size="sm" className="rounded-full">
            2 stale deals
          </Button>
          <Button variant="outline" size="sm" className="rounded-full">
            Brief me
          </Button>
        </div>

        {/* Stat cards — 4-column grid matching the reference dashboard */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Deals</CardTitle>
              <Target className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">36</div>
              <p className="text-xs text-muted-foreground pt-1">+4 this week</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Weighted Pipeline</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">$5.1M</div>
              <p className="text-xs text-muted-foreground pt-1">+12% from last month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Stale Deals</CardTitle>
              <AlertTriangle className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">34</div>
              <p className="text-xs text-muted-foreground pt-1">30+ days no activity</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Next Race</CardTitle>
              <Calendar className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">25d</div>
              <p className="text-xs text-muted-foreground pt-1">Miami Grand Prix</p>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
