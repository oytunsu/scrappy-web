"use client"

import React, { useState, useEffect } from 'react'
import { Card, Button, Input } from '@/components/ui/core'
import {
    Search,
    ExternalLink,
    Phone,
    Globe,
    MapPin,
    ChevronLeft,
    ChevronRight,
    Download,
    Database
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function DataBank() {
    const [data, setData] = useState<any>(null)
    const [page, setPage] = useState(1)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)

    const fetchData = async () => {
        setLoading(true)
        try {
            const res = await fetch(`/api/businesses?page=${page}&search=${search}`)
            const json = await res.json()
            setData(json)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        const timer = setTimeout(fetchData, 300)
        return () => clearTimeout(timer)
    }, [page, search])

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                    <Input
                        placeholder="İşletme adı, telefon veya ID ara..."
                        className="pl-10 h-11"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
                <Button variant="outline" className="h-11 border-dashed">
                    <Download size={16} className="mr-2" /> EXCEL OLARAK DIŞA AKTAR
                </Button>
            </div>

            <Card className="overflow-hidden border-border bg-card/50">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border">
                                <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground w-12">#</th>
                                <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground">İşletme Bilgisi</th>
                                <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground">Kategori / İlçe</th>
                                <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground">İletişim</th>
                                <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground">Puan / Yorum</th>
                                <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground text-right">İşlem</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="p-8 text-center text-muted-foreground">Veriler yükleniyor...</td>
                                    </tr>
                                ))
                            ) : data?.items?.length > 0 ? (
                                data.items.map((item: any, i: number) => (
                                    <tr key={item.id} className="hover:bg-primary/5 transition-colors group">
                                        <td className="p-4 font-mono text-xs text-muted-foreground">{(page - 1) * 50 + i + 1}</td>
                                        <td className="p-4">
                                            <div className="font-bold text-foreground group-hover:text-primary transition-colors">{item.businessName}</div>
                                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5 uppercase">{item.businessId}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                <span className="inline-flex items-center px-2 py-0.5 bg-blue-500/10 text-blue-500 text-[10px] font-bold border border-blue-500/20 w-fit">
                                                    {item.category?.name}
                                                </span>
                                                <span className="inline-flex items-center px-2 py-0.5 bg-amber-500/10 text-amber-500 text-[10px] font-bold border border-amber-500/20 w-fit">
                                                    {item.district?.name}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 space-y-1">
                                            {item.phone && (
                                                <div className="flex items-center text-xs text-muted-foreground">
                                                    <Phone size={12} className="mr-2 text-primary" /> {item.phone}
                                                </div>
                                            )}
                                            {item.website && (
                                                <div className="flex items-center text-xs text-muted-foreground">
                                                    <Globe size={12} className="mr-2 text-primary" />
                                                    <a href={item.website} target="_blank" className="hover:underline truncate max-w-[150px]">Siteye Git</a>
                                                </div>
                                            )}
                                        </td>
                                        <td className="p-4 font-mono text-xs">
                                            <div className="font-bold text-primary">{item.rating || '0.0'} ★</div>
                                            <div className="text-muted-foreground">{item.reviewCount || 0} Yorum</div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <a
                                                href={item.directionLink}
                                                target="_blank"
                                                className="inline-flex items-center justify-center h-8 w-8 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors border border-border"
                                            >
                                                <ExternalLink size={14} />
                                            </a>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="p-20 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <Database className="opacity-20 mb-2" size={40} />
                                            <p className="font-bold uppercase tracking-widest text-sm">Veri Bulunamadı</p>
                                            <p className="text-xs">Arama kriterlerini değiştirerek tekrar deneyin.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {data?.pages > 1 && (
                    <div className="p-4 border-t border-border flex items-center justify-between bg-muted/30">
                        <div className="text-xs text-muted-foreground font-bold uppercase">
                            Toplam <span className="text-foreground">{data.total}</span> Kayıt | Sayfa {page} / {data.pages}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                className="h-9 px-3"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                <ChevronLeft size={16} />
                            </Button>
                            <Button
                                variant="outline"
                                className="h-9 px-3"
                                onClick={() => setPage(p => Math.min(data.pages, p + 1))}
                                disabled={page === data.pages}
                            >
                                <ChevronRight size={16} />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    )
}
