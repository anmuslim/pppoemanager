import fs from 'fs';
import path from 'path';
import { RouterConfig } from './drivers/types.js';
import { encrypt } from './crypto.js';

export interface AuditLogItem {
  id: string;
  timestamp: string;
  username: string;
  routerId: string;
  routerName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'DISCONNECT' | 'ENABLE' | 'DISABLE' | 'TEST';
  targetType: 'SECRET' | 'ACTIVE' | 'PROFILE' | 'QUEUE' | 'POOL' | 'ROUTER';
  targetName: string;
  details?: string;
}

export const ALL_MENU_KEYS = [
  'dashboard',
  'routers',
  'secrets',
  'active',
  'profiles',
  'queues',
  'pools',
  'audit',
  'users',
] as const;

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  role: 'superadmin' | 'operator' | 'technician';
  passwordHash: string; // SHA-256 for simple auth
  createdAt: string;
  allowedMenus: string[];
  status?: 'active' | 'suspended';
  lastLogin?: string;
}

interface AppDatabase {
  routers: RouterConfig[];
  users: AdminUser[];
  auditLogs: AuditLogItem[];
  recentEvents: Array<{
    id: string;
    timestamp: string;
    type: 'connected' | 'disconnected';
    username: string;
    routerName: string;
    ipAddress: string;
  }>;
  demoData?: Record<string, {
    secrets: any[];
    profiles: any[];
    queues: any[];
    pools: any[];
    active: any[];
  }>;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.resolve(DATA_DIR, 'db.json');

class StorageManager {
  private db: AppDatabase;

  constructor() {
    this.db = {
      routers: [],
      users: [],
      auditLogs: [],
      recentEvents: [],
    };
    this.load();
    if (this.db.routers.length === 0) {
      this.seedDemoData();
    }
  }

  private load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.db = JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Failed to read db.json, initializing in-memory fallback:', err);
    }

    // Ensure default admin user and demo users exist
    if (!this.db.users || this.db.users.length === 0) {
      this.db.users = [
        {
          id: 'user-admin-1',
          username: 'admin',
          name: 'Administrator Utama',
          role: 'superadmin',
          // sha256 for 'admin123'
          passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
          createdAt: new Date().toISOString(),
          allowedMenus: [...ALL_MENU_KEYS],
          status: 'active',
        },
        {
          id: 'user-operator-1',
          username: 'operator',
          name: 'Operator Billing & PPP',
          role: 'operator',
          // sha256 for 'operator123'
          passwordHash: 'e6378e9b6e82df4cfad4c622cc47a505e6b3671c6cae70f612501a3eb320092d',
          createdAt: new Date().toISOString(),
          allowedMenus: ['dashboard', 'secrets', 'active', 'queues', 'audit'],
          status: 'active',
        },
        {
          id: 'user-teknisi-1',
          username: 'teknisi',
          name: 'Teknisi Jaringan Lapangan',
          role: 'technician',
          // sha256 for 'teknisi123'
          passwordHash: 'ad8ec288ea0bdf60bb4787d55f058097b64ff1929314c40212f719323c6d7a12',
          createdAt: new Date().toISOString(),
          allowedMenus: ['dashboard', 'routers', 'active', 'pools'],
          status: 'active',
        },
      ];
      this.save();
    } else {
      // Migrate existing users to have allowedMenus and status if missing
      let modified = false;
      this.db.users.forEach((u) => {
        if (!u.allowedMenus || u.allowedMenus.length === 0) {
          u.allowedMenus = u.role === 'superadmin' ? [...ALL_MENU_KEYS] : ['dashboard', 'secrets', 'active'];
          modified = true;
        }
        if (!u.status) {
          u.status = 'active';
          modified = true;
        }
      });
      if (modified) this.save();
    }
  }

  public save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.db, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save to db.json:', err);
    }
  }

  public seedDemoData() {
    const pass = encrypt('demoRouterPass123!');
    this.db.routers = [
      {
        id: 'router-core-idc',
        name: 'Router-Core-IDC',
        host: '10.100.1.1',
        port: 443,
        username: 'api-pppoe',
        encryptedPassword: pass,
        mode: 'REST',
        notes: 'Core CCR2004 di Cyber IDC Lt. 2 (Koneksi REST API v7)',
        isDemo: true,
        status: 'online',
        lastSeen: new Date().toISOString(),
        identity: 'Mikrotik-Core-IDC',
        version: 'RouterOS v7.14.3 (stable)',
        uptime: '38d 14h 22m',
        cpuLoad: 16,
        freeMemory: 3120,
        totalMemory: 4096,
        boardName: 'CCR2004-16G-2S+',
      },
      {
        id: 'router-dist-utama',
        name: 'Router-Dist-Utama',
        host: '10.100.2.1',
        port: 8728,
        username: 'api-admin',
        encryptedPassword: pass,
        mode: 'API',
        notes: 'Distribusi Utama BSD City - RB4011 (Koneksi Winbox API port 8728)',
        isDemo: true,
        status: 'online',
        lastSeen: new Date().toISOString(),
        identity: 'Mikrotik-Dist-BSD',
        version: 'RouterOS v7.13.5 (stable)',
        uptime: '21d 08h 15m',
        cpuLoad: 22,
        freeMemory: 742,
        totalMemory: 1024,
        boardName: 'RB4011iGS+',
      },
      {
        id: 'router-pop-barat',
        name: 'Router-POP-Barat',
        host: '10.100.3.1',
        port: 8729,
        username: 'api-ssl-user',
        encryptedPassword: pass,
        mode: 'API-SSL',
        notes: 'POP Kalideres Tower A - RB760iGS (API-SSL port 8729)',
        isDemo: true,
        status: 'online',
        lastSeen: new Date().toISOString(),
        identity: 'Mikrotik-POP-Barat',
        version: 'RouterOS v7.12.1 (stable)',
        uptime: '14d 03h 48m',
        cpuLoad: 14,
        freeMemory: 382,
        totalMemory: 512,
        boardName: 'RB760iGS (hEX S)',
      },
    ];

    // Seed initial audit log items
    this.db.auditLogs = [
      {
        id: 'log-1',
        timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
        username: 'admin',
        routerId: 'router-core-idc',
        routerName: 'Router-Core-IDC',
        action: 'UPDATE',
        targetType: 'PROFILE',
        targetName: 'profile-100M-Bisnis',
        details: 'Mengubah rate limit menjadi 100M/100M dengan burst',
      },
      {
        id: 'log-2',
        timestamp: new Date(Date.now() - 3600000 * 4).toISOString(),
        username: 'admin',
        routerId: 'router-dist-utama',
        routerName: 'Router-Dist-Utama',
        action: 'CREATE',
        targetType: 'SECRET',
        targetName: 'bsd-residence-079',
        details: 'Pendaftaran pelanggan baru paket 20M-Family',
      },
      {
        id: 'log-3',
        timestamp: new Date(Date.now() - 3600000 * 7).toISOString(),
        username: 'admin',
        routerId: 'router-core-idc',
        routerName: 'Router-Core-IDC',
        action: 'DISCONNECT',
        targetType: 'ACTIVE',
        targetName: 'cust-idc-014',
        details: 'Sesi di-kick oleh admin untuk sinkronisasi profile',
      },
    ];

    // Seed recent connection events
    this.db.recentEvents = [
      {
        id: 'evt-1',
        timestamp: new Date(Date.now() - 1000 * 60 * 4).toISOString(),
        type: 'connected',
        username: 'cust-idc-008',
        routerName: 'Router-Core-IDC',
        ipAddress: '10.10.10.12',
      },
      {
        id: 'evt-2',
        timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        type: 'connected',
        username: 'bsd-residence-045',
        routerName: 'Router-Dist-Utama',
        ipAddress: '10.20.20.47',
      },
      {
        id: 'evt-3',
        timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        type: 'disconnected',
        username: 'pop-barat-014',
        routerName: 'Router-POP-Barat',
        ipAddress: '10.30.10.16',
      },
      {
        id: 'evt-4',
        timestamp: new Date(Date.now() - 1000 * 60 * 38).toISOString(),
        type: 'connected',
        username: 'cyber-022',
        routerName: 'Router-Core-IDC',
        ipAddress: '10.10.20.24',
      },
      {
        id: 'evt-5',
        timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
        type: 'disconnected',
        username: 'pt-sinar-032',
        routerName: 'Router-Core-IDC',
        ipAddress: '10.10.30.34',
      },
    ];

    this.save();
  }

  public getRouters(): RouterConfig[] {
    return this.db.routers;
  }

  public getRouter(id: string): RouterConfig | undefined {
    return this.db.routers.find((r) => r.id === id);
  }

  public addRouter(router: RouterConfig): RouterConfig {
    this.db.routers.push(router);
    this.save();
    return router;
  }

  public updateRouter(id: string, patch: Partial<RouterConfig>): RouterConfig {
    const idx = this.db.routers.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Router with id '${id}' not found`);
    this.db.routers[idx] = { ...this.db.routers[idx], ...patch };
    this.save();
    return this.db.routers[idx];
  }

  public deleteRouter(id: string): boolean {
    const len = this.db.routers.length;
    this.db.routers = this.db.routers.filter((r) => r.id !== id);
    this.save();
    return this.db.routers.length < len;
  }

  public getAuditLogs(): AuditLogItem[] {
    return this.db.auditLogs.slice().sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  public addAuditLog(item: Omit<AuditLogItem, 'id' | 'timestamp'>) {
    const log: AuditLogItem = {
      ...item,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.db.auditLogs.unshift(log);
    if (this.db.auditLogs.length > 500) {
      this.db.auditLogs = this.db.auditLogs.slice(0, 500);
    }
    this.save();
  }

  public getRecentEvents() {
    return this.db.recentEvents;
  }

  public addRecentEvent(event: Omit<AppDatabase['recentEvents'][0], 'id' | 'timestamp'>) {
    const evt = {
      ...event,
      id: `evt-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    this.db.recentEvents.unshift(evt);
    if (this.db.recentEvents.length > 50) {
      this.db.recentEvents = this.db.recentEvents.slice(0, 50);
    }
    this.save();
  }

  public getUsers(): AdminUser[] {
    return this.db.users;
  }

  public getUser(username: string): AdminUser | undefined {
    return this.db.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  public getUserById(id: string): AdminUser | undefined {
    return this.db.users.find((u) => u.id === id);
  }

  public createUser(userData: {
    username: string;
    name: string;
    role: 'superadmin' | 'operator' | 'technician';
    passwordHash: string;
    allowedMenus: string[];
    status?: 'active' | 'suspended';
  }): AdminUser {
    const existing = this.getUser(userData.username);
    if (existing) {
      throw new Error(`Username '${userData.username}' sudah digunakan.`);
    }

    const newUser: AdminUser = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username: userData.username.toLowerCase().trim(),
      name: userData.name.trim(),
      role: userData.role,
      passwordHash: userData.passwordHash,
      allowedMenus: userData.allowedMenus || ['dashboard'],
      status: userData.status || 'active',
      createdAt: new Date().toISOString(),
    };

    this.db.users.push(newUser);
    this.save();
    return newUser;
  }

  public updateUser(
    id: string,
    patch: {
      name?: string;
      role?: 'superadmin' | 'operator' | 'technician';
      passwordHash?: string;
      allowedMenus?: string[];
      status?: 'active' | 'suspended';
      lastLogin?: string;
    }
  ): AdminUser {
    const idx = this.db.users.findIndex((u) => u.id === id);
    if (idx === -1) {
      throw new Error(`User dengan ID '${id}' tidak ditemukan.`);
    }

    const current = this.db.users[idx];
    this.db.users[idx] = {
      ...current,
      ...patch,
      allowedMenus: patch.allowedMenus !== undefined ? patch.allowedMenus : current.allowedMenus,
    };
    this.save();
    return this.db.users[idx];
  }

  public deleteUser(id: string): boolean {
    const user = this.getUserById(id);
    if (!user) return false;
    if (user.username === 'admin') {
      throw new Error('User administrator bawaan (admin) tidak boleh dihapus.');
    }
    const initialLen = this.db.users.length;
    this.db.users = this.db.users.filter((u) => u.id !== id);
    this.save();
    return this.db.users.length < initialLen;
  }

  public updateUserPassword(username: string, newHash: string): boolean {
    const user = this.getUser(username);
    if (!user) return false;
    user.passwordHash = newHash;
    this.save();
    return true;
  }

  public getUserSessionEvents(username: string) {
    const target = username.toLowerCase();
    const fromEvents = this.db.recentEvents
      .filter((e) => e.username.toLowerCase() === target)
      .map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        type: e.type,
        username: e.username,
        routerName: e.routerName,
        ipAddress: e.ipAddress,
        details: e.type === 'connected' ? 'PPPoE Client Terhubung' : 'PPPoE Client Terputus / Logged Out',
      }));

    const fromAudit = this.db.auditLogs
      .filter((l) => l.targetType === 'ACTIVE' && l.targetName.toLowerCase() === target)
      .map((l) => ({
        id: l.id,
        timestamp: l.timestamp,
        type: 'disconnected' as const,
        username: l.targetName,
        routerName: l.routerName,
        ipAddress: '—',
        details: l.details || `Sesi diputus oleh operator: ${l.username}`,
      }));

    // Merge and sort newest first
    return [...fromEvents, ...fromAudit].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  public getDemoData(routerId: string) {
    if (!this.db.demoData) return undefined;
    return this.db.demoData[routerId];
  }

  public saveDemoData(routerId: string, data: { secrets: any[]; profiles: any[]; queues: any[]; pools: any[]; active: any[] }) {
    if (!this.db.demoData) {
      this.db.demoData = {};
    }
    this.db.demoData[routerId] = data;
    this.save();
  }

  public clearDemoData() {
    this.db.demoData = {};
    this.save();
  }
}

export const storage = new StorageManager();
