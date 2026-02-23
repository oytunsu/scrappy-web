"use client"

import React, { useState, useEffect } from 'react'
import { Card, Button, Input } from '@/components/ui/core'
import {
  LayoutDashboard,
  Search,
  Play,
  Database,
  Settings,
  LogOut,
  TrendingUp,
  MapPin,
  Activity,
  RefreshCw,
  AlertTriangle,
  Clock as ClockIcon,
  ShieldCheck,
  Users as UsersIcon
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

// Sub-components
import { LiveMonitor } from '@/components/dashboard/LiveMonitor'
import { DataBank } from '@/components/dashboard/DataBank'
import { FilterPanel } from '@/components/dashboard/FilterPanel'
import { UsersPanel } from '@/components/dashboard/UsersPanel'
import { SettingsPanel } from '@/components/dashboard/SettingsPanel'

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [scraperStatus, setScraperStatus] = useState<any>(null)

  const fetchStats = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/stats')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setStats(data)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchScraperStatus = async () => {
    try {
      const res = await fetch('/api/scraper/status')
      const data = await res.json()
      setScraperStatus(data)
    } catch (err) {
      console.error('Scraper status fetch failed')
    }
  }

  const toggleScraper = async () => {
    try {
      if (scraperStatus?.isRunning) {
        await fetch('/api/scraper/stop', { method: 'POST' })
      } else {
        await fetch('/api/scraper/start', { method: 'POST' })
      }
      fetchScraperStatus()
    } catch (err) {
      console.error('Toggle failed')
    }
  }

  useEffect(() => {
    fetchStats()
    fetchScraperStatus()

    // Scraper çalışırken istatistikleri 5 saniyede bir, çalışmıyorken 30 saniyede bir çek
    const statsInterval = setInterval(fetchStats, scraperStatus?.isRunning ? 5000 : 30000)
    const scraperInterval = setInterval(fetchScraperStatus, 2000)

    return () => {
      clearInterval(statsInterval)
      clearInterval(scraperInterval)
    }
  }, [scraperStatus?.isRunning])

  return (
    <div className="flex h-screen bg-background overflow-hidden text-foreground selection:bg-primary selection:text-primary-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col shrink-0 z-20">
        <div className="p-6 border-b border-border">
          <h1 className="text-xl font-black tracking-tighter text-primary italic">SCRAPPY<span className="text-foreground">PRO</span></h1>
          <p className="text-[9px] text-muted-foreground uppercase tracking-[0.2em] mt-1 font-bold">Admin Central Unit</p>
        </div>

        <nav className="flex-1 p-0 mt-4 overflow-y-auto">
          <SidebarItem icon={<LayoutDashboard size={18} />} label="Genel Bakış" active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
          <SidebarItem icon={<Activity size={18} />} label="Canlı Takip" active={activeTab === 'live'} onClick={() => setActiveTab('live')} />
          <SidebarItem icon={<Database size={18} />} label="Veri Bankası" active={activeTab === 'database'} onClick={() => setActiveTab('database')} />
          <SidebarItem icon={<Search size={18} />} label="İlçe & Filtre" active={activeTab === 'search'} onClick={() => setActiveTab('search')} />
          <SidebarItem icon={<UsersIcon size={18} />} label="Kullanıcılar" active={activeTab === 'users'} onClick={() => setActiveTab('users')} />
          <div className="my-4 border-t border-border mx-4 opacity-50" />
          <SidebarItem icon={<Settings size={18} />} label="Ayarlar" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />
        </nav>

        <div className="p-4 border-t border-border">
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10 group">
            <LogOut size={18} className="mr-2 group-hover:translate-x-1 transition-transform" /> Güvenli Çıkış
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-[#030303] relative">
        {/* Background Grid Accent */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border p-6 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-widest font-black mb-1">
              <div className="w-1 h-1 bg-primary rounded-full" />
              Main Console / {activeTab}
            </div>
            <h2 className="text-2xl font-black tracking-tight uppercase">
              {activeTab === 'overview' && 'Sistem Analizi'}
              {activeTab === 'live' && 'Canlı Motor Akışı'}
              {activeTab === 'database' && 'İşletme Bankası'}
              {activeTab === 'search' && 'Gelişmiş Filtreleme'}
              {activeTab === 'settings' && 'Sistem Konfigürasyonu'}
            </h2>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" className="h-10 px-4 border-muted hover:border-primary transition-all shadow-lg" onClick={fetchStats} disabled={loading}>
              <RefreshCw size={16} className={cn(loading && "animate-spin")} />
            </Button>
            <Button
              onClick={toggleScraper}
              disabled={loading}
              className={cn(
                "h-10 font-black px-6 shadow-xl transition-all",
                scraperStatus?.isRunning
                  ? "bg-destructive hover:bg-destructive/90 text-white"
                  : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-[0_0_20px_rgba(59,130,246,0.3)]"
              )}
            >
              <Play size={16} className={cn("mr-2 fill-current", scraperStatus?.isRunning && "animate-pulse")} />
              {scraperStatus?.isRunning ? 'MOTORU DURDUR' : 'MOTORU ATEŞLE'}
            </Button>
          </div>
        </header>

        <div className="p-8 relative z-0">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                {error ? (
                  <ConnectionError />
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <StatCard title="Toplam Kayıt" value={stats?.totalBusinesses?.toLocaleString('tr-TR') || '0'} sub="Toplam İşletme Sayısı" icon={<Database className="text-primary" />} />
                      <StatCard title="Günlük Akış" value={stats?.todayCount?.toLocaleString('tr-TR') || '0'} sub="Yeni Eklenen Kayıtlar" icon={<TrendingUp className="text-emerald-500" />} />
                      <StatCard title="Bölge Kapsamı" value={stats?.districtCount || '0'} sub="Aktif İlçe Sayısı" icon={<MapPin className="text-amber-500" />} />
                      <StatCard
                        title="Motor Durumu"
                        value={scraperStatus?.isRunning ? "ACTIVE" : "STANDBY"}
                        sub={scraperStatus?.isRunning ? "Tarama Yapılıyor" : "Sinyal Bekleniyor"}
                        icon={<Activity className={cn(scraperStatus?.isRunning ? "text-emerald-500 animate-pulse" : "text-blue-500")} />}
                      />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      <Card className="lg:col-span-2 border-border overflow-hidden flex flex-col shadow-2xl bg-black/40">
                        <div className="bg-[#111] border-b border-border p-3 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Scrappy Console Output</span>
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground/40 italic">secure_tunnel: 3001</span>
                        </div>
                        <div className="p-6 font-mono text-[11px] h-[350px] overflow-y-auto space-y-1.5 leading-relaxed text-left">
                          <p className="text-primary font-bold">&gt;&gt;&gt; SCRAPPY PRO V1.0 STARTED</p>
                          <p className="text-muted-foreground">[{new Date().toLocaleTimeString()}] System: Kernel integrity check passed.</p>
                          <p className="text-muted-foreground">[{new Date().toLocaleTimeString()}] Network: Listening on port 3001...</p>

                          {scraperStatus?.logs?.map((log: string, i: number) => (
                            <p key={i} className={cn(
                              "transition-all duration-300",
                              log.includes('Hata') || log.includes('Kritik') ? "text-destructive" :
                                log.includes('Kaydedildi') ? "text-emerald-500" :
                                  "text-muted-foreground"
                            )}>
                              {log}
                            </p>
                          ))}

                          {scraperStatus?.isRunning && (
                            <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded flex justify-between items-center animate-in fade-in slide-in-from-bottom-2">
                              <div>
                                <p className="text-[9px] text-primary font-black uppercase tracking-widest">Şu An Taranan</p>
                                <p className="text-xs font-bold text-white">{scraperStatus.currentCategory} / {scraperStatus.currentDistrict}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-[9px] text-primary font-black uppercase tracking-widest">İşlenen Firma</p>
                                <p className="text-xl font-black text-white">{scraperStatus.processedCount}</p>
                              </div>
                            </div>
                          )}

                          <div className="w-2 h-4 bg-primary animate-pulse inline-block" />
                        </div>
                      </Card>

                      <Card className="p-6 border-border flex flex-col bg-card/40">
                        <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                          <div className="w-1 h-3 bg-primary" /> Kategori Sıralaması
                        </h3>
                        <div className="space-y-6 flex-1">
                          {stats?.categories?.length > 0 ? (
                            stats.categories.map((cat: any, i: number) => (
                              <CategoryProgress key={i} label={cat.name} count={cat.count} percent={cat.percent} />
                            ))
                          ) : (
                            <div className="flex flex-col items-center justify-center h-full text-muted-foreground italic text-[10px]">
                              Henüz taranmış kategori yok.
                            </div>
                          )}
                        </div>
                        <Button variant="outline" className="w-full mt-6 text-[10px] font-black tracking-widest uppercase py-6 border-dashed opacity-60 hover:opacity-100 transition-opacity" onClick={() => setActiveTab('database')}>
                          VERİ BANKASINA GİT
                        </Button>
                      </Card>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {activeTab === 'live' && (
              <motion.div key="live" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <LiveMonitor />
              </motion.div>
            )}

            {activeTab === 'database' && (
              <motion.div key="database" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <DataBank />
              </motion.div>
            )}

            {activeTab === 'search' && (
              <motion.div key="search" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <FilterPanel />
              </motion.div>
            )}

            {activeTab === 'users' && (
              <motion.div key="users" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <UsersPanel />
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
                <SettingsPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

function SidebarItem({ icon, label, active, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center px-6 py-4 text-sm font-black transition-all relative group overflow-hidden",
        active
          ? "bg-primary/5 text-primary"
          : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/30"
      )}
    >
      <span className={cn("mr-4 transition-all", active ? "scale-110 text-primary" : "group-hover:translate-x-1")}>{icon}</span>
      <span className="uppercase tracking-[0.15em] text-[10px]">{label}</span>
      {active && (
        <motion.div
          layoutId="sidebarActive"
          className="absolute left-0 w-1 h-3/5 my-auto bg-primary shadow-[0_0_15px_rgba(59,130,246,1)]"
        />
      )}
    </button>
  )
}

function StatCard({ title, value, sub, icon }: any) {
  return (
    <Card className="p-6 border-border relative group hover:border-primary/50 transition-all cursor-default bg-card/20 backdrop-blur-sm">
      <div className="flex justify-between items-start relative z-10">
        <div>
          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2 opacity-50 group-hover:opacity-100 transition-opacity">{title}</p>
          <h4 className="text-3xl font-black font-mono tracking-tighter transition-all group-hover:tracking-normal group-hover:text-primary">{value}</h4>
          <p className="text-[9px] text-muted-foreground font-black uppercase mt-3 tracking-wider bg-muted w-fit px-1.5 py-0.5">{sub}</p>
        </div>
        <div className="p-3 bg-muted group-hover:bg-primary/20 transition-all">
          {icon}
        </div>
      </div>
      <div className="absolute top-0 right-0 p-1 opacity-[0.02] group-hover:opacity-[0.08] scale-[5] transition-all -rotate-12 pointer-events-none origin-top-right">
        {icon}
      </div>
    </Card>
  )
}

function CategoryProgress({ label, count, percent }: any) {
  return (
    <div className="space-y-2.5">
      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-primary font-mono">{count.toLocaleString('tr-TR')}</span>
      </div>
      <div className="h-1 w-full bg-muted/30 relative overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${percent}%` }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
          className="h-full bg-primary shadow-[0_0_10px_rgba(59,130,246,0.5)]"
        />
      </div>
    </div>
  )
}

function ConnectionError() {
  return (
    <Card className="p-12 border-destructive/30 bg-destructive/5 flex flex-col items-center text-center shadow-2xl relative overflow-hidden group">
      <div className="absolute inset-x-0 top-0 h-1 bg-destructive/50" />
      <AlertTriangle size={64} className="text-destructive mb-6 animate-bounce" />
      <h3 className="text-2xl font-black uppercase tracking-widest mb-4">Veritabanı Bağlantı Hatası</h3>
      <p className="text-muted-foreground max-w-md text-sm leading-relaxed mb-8">
        Yerel MySQL sunucusu ile iletişim kurulamıyor. <br />
        <span className="text-destructive/80 font-mono mt-2 block">PRISMA_CONN_ERR / ERR_CONNECTION_REFUSED</span>
      </p>
      <div className="flex gap-4">
        <Button variant="outline" className="h-12 px-8 font-black uppercase tracking-widest border-destructive/20 hover:bg-destructive/10" onClick={() => window.location.reload()}>
          Yeniden Dene
        </Button>
        <Button variant="outline" className="h-12 px-8 font-black uppercase tracking-widest opacity-50 cursor-not-allowed">
          Hata Logları
        </Button>
      </div>
    </Card>
  )
}
