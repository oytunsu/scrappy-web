"use client"

import React, { useState, useEffect } from 'react'
import { Card, Button, Input } from '@/components/ui/core'
import {
    MapPin,
    Tags,
    Search,
    ChevronRight,
    Filter,
    CheckCircle2,
    Circle
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function FilterPanel() {
    const [data, setData] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [searchDistrict, setSearchDistrict] = useState('')
    const [searchCategory, setSearchCategory] = useState('')

    const fetchData = async () => {
        try {
            const res = await fetch('/api/locations')
            const json = await res.json()
            setData(json)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const filteredDistricts = data?.districts?.filter((d: any) =>
        d.name.toLowerCase().includes(searchDistrict.toLowerCase())
    ) || []

    const filteredCategories = data?.categories?.filter((c: any) =>
        c.name.toLowerCase().includes(searchCategory.toLowerCase())
    ) || []

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Districts Column */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <MapPin size={16} className="text-amber-500" /> İlçeler
                    </h3>
                    <span className="text-[10px] font-bold bg-muted px-2 py-1 uppercase">{filteredDistricts.length} Toplam</span>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input
                        placeholder="İlçe ara..."
                        className="pl-9 h-10 text-xs"
                        value={searchDistrict}
                        onChange={(e) => setSearchDistrict(e.target.value)}
                    />
                </div>

                <Card className="max-h-[500px] overflow-y-auto border-border bg-black/20 scrollbar-thin scrollbar-thumb-primary">
                    {loading ? (
                        <div className="p-8 text-center text-xs text-muted-foreground italic uppercase">Yükleniyor...</div>
                    ) : filteredDistricts.length > 0 ? (
                        <div className="divide-y divide-border/50">
                            {filteredDistricts.map((d: any) => (
                                <div key={d.id} className="p-4 flex items-center justify-between hover:bg-primary/5 transition-colors group cursor-pointer">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-muted flex items-center justify-center font-bold text-[10px] text-muted-foreground group-hover:text-primary transition-colors">
                                            {d.name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold uppercase">{d.name}</div>
                                            <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-tighter">{d.city}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="text-xs font-mono font-bold text-primary">{d.count.toLocaleString('tr-TR')}</div>
                                            <div className="text-[8px] text-muted-foreground uppercase font-black">Kayıt</div>
                                        </div>
                                        <ChevronRight size={14} className="text-muted-foreground/30 group-hover:text-primary transition-all translate-x-0 group-hover:translate-x-1" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                            <MapPin size={24} className="opacity-20" />
                            İLÇE BULUNAMADI
                        </div>
                    )}
                </Card>
            </div>

            {/* Categories Column */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <Tags size={16} className="text-blue-500" /> Kategoriler
                    </h3>
                    <span className="text-[10px] font-bold bg-muted px-2 py-1 uppercase">{filteredCategories.length} Aktif</span>
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
                    <Input
                        placeholder="Kategori ara..."
                        className="pl-9 h-10 text-xs"
                        value={searchCategory}
                        onChange={(e) => setSearchCategory(e.target.value)}
                    />
                </div>

                <Card className="max-h-[500px] overflow-y-auto border-border bg-black/20 scrollbar-thin scrollbar-thumb-primary">
                    {loading ? (
                        <div className="p-8 text-center text-xs text-muted-foreground italic uppercase">Yükleniyor...</div>
                    ) : filteredCategories.length > 0 ? (
                        <div className="grid grid-cols-1 divide-y divide-border/50">
                            {filteredCategories.map((c: any) => (
                                <div key={c.id} className="p-4 flex items-center justify-between hover:bg-primary/5 transition-colors group cursor-pointer">
                                    <div className="flex items-center gap-3 text-sm font-bold uppercase">
                                        <div className="p-2 bg-muted transition-colors group-hover:bg-primary/10">
                                            <Tags size={12} className="text-muted-foreground group-hover:text-primary" />
                                        </div>
                                        {c.name}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="text-xs font-mono font-bold text-primary">{c.count.toLocaleString('tr-TR')}</div>
                                            <div className="text-[8px] text-muted-foreground uppercase font-black">Toplam Firma</div>
                                        </div>
                                        <ChevronRight size={14} className="text-muted-foreground/30 group-hover:text-primary transition-all translate-x-0 group-hover:translate-x-1" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                            <Tags size={24} className="opacity-20" />
                            KATEGORİ BULUNAMADI
                        </div>
                    )}
                </Card>

                {/* Action Card */}
                <Card className="p-6 border-primary/20 bg-primary/5 border-l-4 border-l-primary">
                    <h4 className="text-xs font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                        <Filter size={14} /> Hızlı Yapılandırma
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                        Buradan seçeceğiniz ilçe ve kategoriler, "MOTOR" başlatıldığında öncelikli hedef olarak belirlenecektir.
                    </p>
                    <div className="mt-4 flex gap-2">
                        <Button className="h-9 px-4 text-[10px] font-black uppercase tracking-wider w-full">Önceliği Kaydet</Button>
                    </div>
                </Card>
            </div>
        </div>
    )
}
