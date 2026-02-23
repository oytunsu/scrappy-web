"use client"

import React, { useState, useEffect } from 'react'
import { Card, Button, Input } from '@/components/ui/core'
import {
    Settings as SettingsIcon,
    Save,
    Globe,
    Cpu,
    Shield,
    Bell,
    CheckCircle2,
    AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function SettingsPanel() {
    const [settings, setSettings] = useState({
        siteName: 'ScrappyPro Admin',
        baseUrl: 'http://localhost:3001',
        scrapeInterval: '30',
        maxConcurrentJobs: '5',
        logRetentionDays: '7',
        maintenanceMode: 'false'
    })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)

    const fetchSettings = async () => {
        try {
            const res = await fetch('/api/settings')
            const data = await res.json()
            if (Object.keys(data).length > 0) {
                setSettings(prev => ({ ...prev, ...data }))
            }
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchSettings()
    }, [])

    const handleSave = async () => {
        setSaving(true)
        setStatus(null)
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            })
            if (res.ok) {
                setStatus({ type: 'success', message: 'Ayarlar başarıyla kaydedildi.' })
            } else {
                throw new Error('Hata oluştu')
            }
        } catch (e) {
            setStatus({ type: 'error', message: 'Ayarlar kaydedilemedi.' })
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-20 text-center uppercase tracking-widest text-xs opacity-50">Sistem ayarları yükleniyor...</div>

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <SettingsIcon size={18} className="text-primary" /> Sistem Konfigürasyonu
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase mt-1">Cihaz ve ağ parametrelerini yönetin</p>
                </div>
                <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-primary h-11 px-8 font-black uppercase text-xs tracking-widest shadow-xl shadow-primary/20"
                >
                    {saving ? 'KAYDEDİLİYOR...' : <><Save size={16} className="mr-2" /> DEĞİŞİKLİKLERİ KAYDET</>}
                </Button>
            </div>

            {status && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                        "p-4 border-l-4 flex items-center gap-3 text-xs font-bold uppercase tracking-wider",
                        status.type === 'success' ? "bg-emerald-500/10 border-emerald-500 text-emerald-500" : "bg-destructive/10 border-destructive text-destructive"
                    )}
                >
                    {status.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    {status.message}
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* General Settings */}
                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-primary tracking-widest bg-primary/5 w-fit px-2 py-1">
                        <Globe size={12} /> Genel Tercihler
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground">Panel Başlığı</label>
                            <Input
                                value={settings.siteName}
                                onChange={e => setSettings({ ...settings, siteName: e.target.value })}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground">Base API URL</label>
                            <Input
                                value={settings.baseUrl}
                                onChange={e => setSettings({ ...settings, baseUrl: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-muted/20 border border-border">
                            <div className="space-y-0.5">
                                <p className="text-xs font-bold uppercase">Bakım Modu</p>
                                <p className="text-[9px] text-muted-foreground uppercase">Sadece adminler erişebilir</p>
                            </div>
                            <button
                                onClick={() => setSettings({ ...settings, maintenanceMode: settings.maintenanceMode === 'true' ? 'false' : 'true' })}
                                className={cn(
                                    "w-12 h-6 border transition-colors relative",
                                    settings.maintenanceMode === 'true' ? "bg-primary border-primary" : "bg-muted border-white/10"
                                )}
                            >
                                <div className={cn(
                                    "absolute top-1 w-4 h-4 transition-all",
                                    settings.maintenanceMode === 'true' ? "right-1 bg-white" : "left-1 bg-muted-foreground"
                                )} />
                            </button>
                        </div>
                    </div>
                </section>

                {/* Engine Settings */}
                <section className="space-y-6">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-amber-500 tracking-widest bg-amber-500/5 w-fit px-2 py-1">
                        <Cpu size={12} /> Kazıma Motoru Parametreleri
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-muted-foreground">İşlem Gecikmesi (sn)</label>
                                <Input
                                    type="number"
                                    value={settings.scrapeInterval}
                                    onChange={e => setSettings({ ...settings, scrapeInterval: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase text-muted-foreground">Maks. Eşzamanlı</label>
                                <Input
                                    type="number"
                                    value={settings.maxConcurrentJobs}
                                    onChange={e => setSettings({ ...settings, maxConcurrentJobs: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase text-muted-foreground">Log Saklama Süresi (Gün)</label>
                            <Input
                                type="number"
                                value={settings.logRetentionDays}
                                onChange={e => setSettings({ ...settings, logRetentionDays: e.target.value })}
                            />
                        </div>

                        <Card className="p-4 border-amber-500/20 bg-amber-500/5">
                            <div className="flex gap-3">
                                <AlertCircle size={16} className="text-amber-500 shrink-0" />
                                <div>
                                    <p className="text-[10px] font-bold uppercase text-amber-500">Kritik Ayar</p>
                                    <p className="text-[9px] text-muted-foreground leading-relaxed mt-1">
                                        Gecikme süresini 10 saniyenin altına düşürmek Google Bot korumasına takılma riskini artırır.
                                    </p>
                                </div>
                            </div>
                        </Card>
                    </div>
                </section>
            </div>

            {/* Dangerous Operations */}
            <section className="pt-8 border-t border-border space-y-6">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase text-destructive tracking-widest bg-destructive/5 w-fit px-2 py-1">
                    <Shield size={12} /> Tehlikeli İşlemler
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center p-6 border border-destructive/20 bg-destructive/5 rounded-lg">
                    <div className="space-y-1.5">
                        <h4 className="text-xs font-black uppercase tracking-tight text-destructive">Tüm Veritabanını Temizle</h4>
                        <p className="text-[10px] text-muted-foreground uppercase leading-relaxed">
                            Kullanıcılar (Admin) hariç tüm işletmeleri, ilçeleri, kategorileri ve logları kalıcı olarak siler. <br />
                            <span className="text-destructive font-black underline">BU İŞLEM GERİ ALINAMAZ!</span>
                        </p>
                    </div>
                    <div className="flex justify-end">
                        <ClearDatabaseButton />
                    </div>
                </div>
            </section>

            <div className="pt-8 border-t border-border flex justify-between items-center opacity-50">
                <p className="text-[9px] font-bold uppercase tracking-widest">Sistem Sürümü: 1.0.4-stable</p>
                <p className="text-[9px] font-bold uppercase tracking-widest">Son Güncelleme: {new Date().toLocaleDateString('tr-TR')}</p>
            </div>
        </div>
    )
}

function ClearDatabaseButton() {
    const [step, setStep] = useState(0) // 0: Normal, 1: Confirm 1, 2: Confirm 2 (Loading)
    const [loading, setLoading] = useState(false)

    const handleClear = async () => {
        if (step === 0) {
            setStep(1)
            return
        }

        if (step === 1) {
            setLoading(true)
            try {
                const res = await fetch('/api/db/clear', { method: 'POST' })
                const data = await res.json()
                if (data.success) {
                    alert('Veritabanı başarıyla temizlendi.')
                    window.location.reload()
                } else {
                    alert('Hata: ' + data.error)
                }
            } catch (err) {
                alert('Sistem hatası oluştu.')
            } finally {
                setLoading(false)
                setStep(0)
            }
        }
    }

    return (
        <div className="flex items-center gap-4">
            {step === 1 && (
                <button
                    onClick={() => setStep(0)}
                    className="text-[10px] font-black uppercase text-muted-foreground hover:text-foreground underline underline-offset-4"
                >
                    VAZGEÇ
                </button>
            )}
            <Button
                variant={step === 1 ? "destructive" : "outline"}
                disabled={loading}
                onClick={handleClear}
                className={cn(
                    "h-11 px-8 font-black uppercase text-[10px] tracking-[0.2em] transition-all",
                    step === 1 ? "bg-destructive text-white animate-pulse" : "border-destructive/30 text-destructive hover:bg-destructive/10"
                )}
            >
                {loading ? 'SİLİNİYOR...' : step === 1 ? 'EMİN MİSİNİZ? (YOK ET)' : 'VERİTABANINI SIFIRLA'}
            </Button>
        </div>
    )
}

import { motion } from 'framer-motion'
