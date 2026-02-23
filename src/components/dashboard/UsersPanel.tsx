"use client"

import React, { useState, useEffect } from 'react'
import { Card, Button, Input } from '@/components/ui/core'
import {
    Users,
    UserPlus,
    Trash2,
    Edit2,
    ShieldCheck,
    X,
    Check
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function UsersPanel() {
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [newUser, setNewUser] = useState({ username: '', password: '' })
    const [editingId, setEditingId] = useState<number | null>(null)
    const [editData, setEditData] = useState({ username: '', password: '' })

    const fetchUsers = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/users')
            const data = await res.json()
            if (Array.isArray(data)) setUsers(data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchUsers()
    }, [])

    const handleAdd = async () => {
        if (!newUser.username || !newUser.password) return
        try {
            const res = await fetch('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser)
            })
            if (res.ok) {
                setNewUser({ username: '', password: '' })
                setIsAdding(false)
                fetchUsers()
            }
        } catch (e) {
            console.error(e)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return
        try {
            await fetch(`/api/users/${id}`, { method: 'DELETE' })
            fetchUsers()
        } catch (e) {
            console.error(e)
        }
    }

    const handleUpdate = async (id: number) => {
        try {
            const res = await fetch(`/api/users/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editData)
            })
            if (res.ok) {
                setEditingId(null)
                setEditData({ username: '', password: '' })
                fetchUsers()
            }
        } catch (e) {
            console.error(e)
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                        <ShieldCheck size={18} className="text-primary" /> Sistem Yöneticileri
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase mt-1">Panel yetkisine sahip kullanıcılar</p>
                </div>
                {!isAdding && (
                    <Button onClick={() => setIsAdding(true)} className="bg-primary h-10 px-6 font-black uppercase text-xs tracking-widest">
                        <UserPlus size={16} className="mr-2" /> YENİ ADMİN EKLE
                    </Button>
                )}
            </div>

            {isAdding && (
                <Card className="p-6 border-primary/30 bg-primary/5 border-l-4 border-l-primary flex flex-col md:flex-row gap-4 items-end animate-in zoom-in-95 duration-200">
                    <div className="flex-1 space-y-1.5 w-full">
                        <label className="text-[10px] font-black uppercase text-muted-foreground">Kullanıcı Adı</label>
                        <Input
                            value={newUser.username}
                            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                            placeholder="admin2024"
                            className="h-10 text-xs"
                        />
                    </div>
                    <div className="flex-1 space-y-1.5 w-full">
                        <label className="text-[10px] font-black uppercase text-muted-foreground">Şifre</label>
                        <Input
                            type="password"
                            value={newUser.password}
                            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                            placeholder="••••••••"
                            className="h-10 text-xs"
                        />
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={handleAdd} className="h-10 px-4 bg-primary">EKLE</Button>
                        <Button onClick={() => setIsAdding(false)} variant="outline" className="h-10 px-4 border-dashed">İPTAL</Button>
                    </div>
                </Card>
            )}

            <Card className="overflow-hidden border-border bg-card/20 backdrop-blur-sm shadow-2xl">
                <table className="w-full text-left text-sm border-collapse">
                    <thead>
                        <tr className="bg-muted/50 border-b border-border">
                            <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground">ID</th>
                            <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground">Yönetici</th>
                            <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground">Oluşturulma</th>
                            <th className="p-4 font-black uppercase text-[10px] tracking-widest text-muted-foreground text-right">İşlemler</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {loading ? (
                            <tr><td colSpan={4} className="p-12 text-center text-muted-foreground italic uppercase text-xs">Yükleniyor...</td></tr>
                        ) : users.map((user) => (
                            <tr key={user.id} className="hover:bg-primary/5 transition-colors group">
                                <td className="p-4 font-mono text-xs text-muted-foreground">#{user.id}</td>
                                <td className="p-4">
                                    {editingId === user.id ? (
                                        <div className="flex gap-2 items-center">
                                            <Input
                                                value={editData.username}
                                                onChange={(e) => setEditData({ ...editData, username: e.target.value })}
                                                className="h-8 max-w-[150px] text-xs"
                                            />
                                            <Input
                                                type="password"
                                                placeholder="Yeni Şifre"
                                                onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                                                className="h-8 max-w-[120px] text-xs"
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 bg-muted flex items-center justify-center font-bold text-[10px] group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                                AD
                                            </div>
                                            <span className="font-bold uppercase tracking-tight">{user.username}</span>
                                        </div>
                                    )}
                                </td>
                                <td className="p-4 text-xs text-muted-foreground">
                                    {new Date(user.createdAt).toLocaleDateString('tr-TR')}
                                </td>
                                <td className="p-4 text-right">
                                    {editingId === user.id ? (
                                        <div className="flex gap-1 justify-end">
                                            <Button onClick={() => handleUpdate(user.id)} className="h-8 w-8 p-0 bg-emerald-600 hover:bg-emerald-700">
                                                <Check size={14} />
                                            </Button>
                                            <Button onClick={() => setEditingId(null)} variant="outline" className="h-8 w-8 p-0">
                                                <X size={14} />
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Button
                                                onClick={() => {
                                                    setEditingId(user.id)
                                                    setEditData({ username: user.username, password: '' })
                                                }}
                                                variant="ghost"
                                                className="h-8 w-8 p-0 hover:text-primary"
                                            >
                                                <Edit2 size={14} />
                                            </Button>
                                            <Button
                                                onClick={() => handleDelete(user.id)}
                                                variant="ghost"
                                                className="h-8 w-8 p-0 hover:text-destructive"
                                            >
                                                <Trash2 size={14} />
                                            </Button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Card>

            <div className="p-6 bg-amber-500/5 border border-amber-500/20 text-center">
                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">⚠️ Güvenlik Notu</p>
                <p className="text-xs text-muted-foreground mt-2 max-w-sm mx-auto leading-relaxed">
                    Admin şifrelerini kimseyle paylaşmayın. Şifre sızıntısı durumunda sistemdeki tüm veriler tehlikeye girebilir.
                </p>
            </div>
        </div>
    )
}
