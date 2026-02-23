"use client"

import React, { useState, useEffect } from 'react'
import { Card, Button } from '@/components/ui/core'
import {
    Terminal,
    Activity,
    Wifi,
    WifiOff,
    Square,
    Play,
    RotateCcw,
    MapPin,
    Globe,
    Database,
    Clock
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export function LiveMonitor() {
    const [status, setStatus] = useState<any>(null)
    const [isConnected, setIsConnected] = useState(true)

    const fetchStatus = async () => {
        try {
            const res = await fetch('/api/scraper/status')
            const data = await res.json()
            setStatus(data)
            setIsConnected(true)
        } catch (e) {
            setIsConnected(false)
        }
    }

    const toggleScraper = async () => {
        try {
            if (status?.isRunning) {
                await fetch('/api/scraper/stop', { method: 'POST' })
            } else {
                await fetch('/api/scraper/start', { method: 'POST' })
            }
            fetchStatus()
        } catch (err) {
            console.error('Toggle failed')
        }
    }

    useEffect(() => {
        fetchStatus()
        const interval = setInterval(fetchStatus, 2000)
        return () => clearInterval(interval)
    }, [])

    const logs = status?.logs || []

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Control Strip */}
            <Card className="p-4 bg-card border-l-4 border-l-primary flex flex-wrap gap-4 items-center justify-between shadow-xl">
                <div className="flex items-center gap-6">
                    <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Motor Durumu</p>
                        <div className="flex items-center gap-2">
                            <div className={cn("w-2 h-2 rounded-full", status?.isRunning ? "bg-emerald-500 animate-pulse" : "bg-muted")} />
                            <span className="text-xs font-bold uppercase">{status?.isRunning ? 'Aktif' : 'Beklemede'}</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Yerel Bağlantı</p>
                        <div className="flex items-center gap-2">
                            {isConnected ? <Wifi size={14} className="text-emerald-500" /> : <WifiOff size={14} className="text-destructive" />}
                            <span className="text-xs font-bold uppercase">{isConnected ? 'Bağlı' : 'Kesildi'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        onClick={toggleScraper}
                        className={cn(
                            "h-10 font-bold px-6 transition-all",
                            status?.isRunning ? "bg-destructive hover:bg-destructive/90" : "bg-emerald-600 hover:bg-emerald-700"
                        )}
                    >
                        {status?.isRunning ? (
                            <><Square size={14} className="mr-2 fill-current" /> ACİL DURDUR</>
                        ) : (
                            <><Play size={14} className="mr-2 fill-current" /> SİSTEMİ ATEŞLE</>
                        )}
                    </Button>
                </div>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
                {/* Terminal Window */}
                <Card className="xl:col-span-3 border-border bg-black shadow-2xl overflow-hidden flex flex-col h-[600px]">
                    <div className="bg-[#1a1a1a] border-b border-border p-3 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Terminal size={14} className="text-primary" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Scrappy Engine Detaylı Log Akışı</span>
                        </div>
                        <div className="flex gap-1.5 opacity-30">
                            <div className="w-2.5 h-2.5 rounded-none border border-white" />
                            <div className="w-2.5 h-2.5 rounded-none border border-white" />
                            <div className="w-2.5 h-2.5 rounded-none border border-white" />
                        </div>
                    </div>

                    <div className="flex-1 p-6 font-mono text-[11px] overflow-y-auto space-y-1.5 leading-relaxed bg-[#050505]">
                        <AnimatePresence initial={false}>
                            {logs.length > 0 ? logs.map((log: string, i: number) => (
                                <motion.div
                                    initial={{ opacity: 0, x: -5 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    key={i}
                                    className="flex gap-4 border-l border-white/5 pl-4 py-0.5 hover:bg-white/5 group"
                                >
                                    <span className={cn(
                                        "transition-colors",
                                        log.includes('Hata') || log.includes('Kritik') ? "text-destructive" :
                                            log.includes('Kaydedildi') || log.includes('+') ? "text-emerald-500" :
                                                "text-muted-foreground"
                                    )}>
                                        {log}
                                    </span>
                                </motion.div>
                            )) : (
                                <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                                    <Activity size={48} className="mb-4 animate-pulse" />
                                    <p className="text-sm uppercase tracking-widest font-black">Motor Beklemede</p>
                                    <p className="text-[10px] mt-2">Log akışı için sol üstteki butonu kullanın.</p>
                                </div>
                            )}
                        </AnimatePresence>
                        <div className="pt-2">
                            <div className="w-2 h-4 bg-primary animate-pulse inline-block" />
                        </div>
                    </div>
                </Card>

                {/* Status Panel */}
                <div className="space-y-6">
                    <Card className="p-6 border-border bg-card/40 backdrop-blur-md">
                        <h3 className="text-xs font-black uppercase tracking-widest mb-6 flex items-center">
                            <div className="w-1 h-3 bg-primary mr-2" /> İşlem Özeti
                        </h3>
                        <div className="space-y-6">
                            <StatusMiniCard
                                label="Aktif İlçe"
                                value={status?.currentDistrict || '—'}
                                icon={<MapPin size={14} className="text-amber-500" />}
                            />
                            <StatusMiniCard
                                label="Kategori"
                                value={status?.currentCategory || '—'}
                                icon={<Globe size={14} className="text-blue-500" />}
                            />
                            <StatusMiniCard
                                label="İşlenen"
                                value={status?.processedCount || '0'}
                                icon={<Database size={14} className="text-purple-500" />}
                            />
                            <StatusMiniCard
                                label="Uptime"
                                value={status?.startTime ? new Date(status.startTime).toLocaleTimeString() : '00:00:00'}
                                icon={<Clock size={14} className="text-emerald-500" />}
                            />
                        </div>
                    </Card>

                    <Card className="p-6 border-border bg-primary/5 border-dashed">
                        <h3 className="text-xs font-black uppercase tracking-widest mb-4">Sistem Notu</h3>
                        <p className="text-[10px] text-muted-foreground leading-relaxed uppercase font-bold opacity-70">
                            Playwright yerel motoru stabil. Veritabanı (MariaDB/MySQL) bağlantısı kontrol edildi. CAPTCHA koruması aktif.
                        </p>
                    </Card>
                </div>
            </div>
        </div>
    )
}

function StatusMiniCard({ label, value, icon }: any) {
    return (
        <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-muted transition-colors group-hover:bg-primary/10">
                    {icon}
                </div>
                <span className="text-[10px] font-black uppercase text-muted-foreground">{label}</span>
            </div>
            <span className="text-xs font-mono font-bold text-foreground truncate max-w-[100px] text-right">{value}</span>
        </div>
    )
}
