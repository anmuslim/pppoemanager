import {
  IRouterDriver,
  RouterConfig,
  RouterConnectionTestResult,
  PppSecret,
  PppActive,
  PppProfile,
  SimpleQueue,
  IpPool,
} from './types.js';

export class RouterosApiDriver implements IRouterDriver {
  private config: RouterConfig;
  private password?: string;

  constructor(config: RouterConfig, password?: string) {
    this.config = config;
    this.password = password;
  }

  private async getClient(): Promise<any> {
    try {
      const routeros = await import('node-routeros');
      const RouterOSAPI = (routeros as any).RouterOSAPI || (routeros as any).default?.RouterOSAPI || routeros;
      const conn = new RouterOSAPI({
        host: this.config.host,
        user: this.config.username,
        password: this.password || '',
        port: this.config.port || (this.config.mode === 'API-SSL' ? 8729 : 8728),
        timeout: 5,
        tls: this.config.mode === 'API-SSL' ? { rejectUnauthorized: false } : undefined,
      });
      await conn.connect();
      return conn;
    } catch (err: any) {
      throw new Error(`Gagal membuka koneksi RouterOS API ke ${this.config.host}:${this.config.port || 8728} - ${err.message}`);
    }
  }

  private async runCommand(menu: string, action: string = 'print', params: Record<string, any> = {}): Promise<any[]> {
    const conn = await this.getClient();
    try {
      const cmd = `/${menu}/${action}`;
      const args: any[] = [];
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          args.push(`?=${k}=${v}`);
        }
      }
      const res = await conn.write(cmd, args);
      return Array.isArray(res) ? res : [res];
    } finally {
      try {
        await conn.close();
      } catch {}
    }
  }

  async testConnection(): Promise<RouterConnectionTestResult> {
    try {
      const resList = await this.runCommand('system/resource', 'print');
      const identityList = await this.runCommand('system/identity', 'print').catch(() => []);
      const res = resList[0] || {};
      const id = identityList[0]?.name || this.config.name;

      const totalMem = Math.round((Number(res['total-memory']) || 0) / 1048576);
      const freeMem = Math.round((Number(res['free-memory']) || 0) / 1048576);

      return {
        success: true,
        identity: id,
        version: res?.version || 'RouterOS',
        uptime: res?.uptime || 'Unknown',
        cpuLoad: Number(res['cpu-load']) || 0,
        freeMemory: freeMem,
        totalMemory: totalMem,
        boardName: res['board-name'] || 'MikroTik Router',
      };
    } catch (err: any) {
      return {
        success: false,
        identity: this.config.name,
        version: '',
        uptime: '',
        cpuLoad: 0,
        freeMemory: 0,
        totalMemory: 0,
        boardName: '',
        error: err.message || 'Koneksi API MikroTik gagal',
      };
    }
  }

  async getSystemResource() {
    const test = await this.testConnection();
    if (!test.success) throw new Error(test.error || 'Gagal mengambil system resource');
    return {
      identity: test.identity,
      version: test.version,
      uptime: test.uptime,
      cpuLoad: test.cpuLoad,
      freeMemory: test.freeMemory,
      totalMemory: test.totalMemory,
      boardName: test.boardName,
    };
  }

  async getSecrets(): Promise<PppSecret[]> {
    const raw = await this.runCommand('ppp/secret', 'print');
    return raw.map((item) => ({
      name: item.name,
      password: item.password,
      service: item.service || 'any',
      profile: item.profile || 'default',
      localAddress: item['local-address'],
      remoteAddress: item['remote-address'],
      callerId: item['caller-id'],
      disabled: item.disabled === 'true' || item.disabled === true,
      comment: item.comment,
      lastLoggedOut: item['last-logged-out'],
      routerId: this.config.id,
      routerName: this.config.name,
    }));
  }

  async createSecret(secret: PppSecret): Promise<PppSecret> {
    const params: Record<string, any> = {
      name: secret.name,
      password: secret.password || '',
      service: secret.service || 'pppoe',
      profile: secret.profile || 'default',
      disabled: secret.disabled ? 'yes' : 'no',
    };
    if (secret.localAddress) params['local-address'] = secret.localAddress;
    if (secret.remoteAddress) params['remote-address'] = secret.remoteAddress;
    if (secret.callerId) params['caller-id'] = secret.callerId;
    if (secret.comment) params.comment = secret.comment;

    await this.runCommand('ppp/secret', 'add', params);
    return { ...secret, routerId: this.config.id, routerName: this.config.name };
  }

  async updateSecret(name: string, secret: Partial<PppSecret>): Promise<PppSecret> {
    const params: Record<string, any> = {
      numbers: name,
    };
    if (secret.password !== undefined) params.password = secret.password;
    if (secret.service !== undefined) params.service = secret.service;
    if (secret.profile !== undefined) params.profile = secret.profile;
    if (secret.localAddress !== undefined) params['local-address'] = secret.localAddress;
    if (secret.remoteAddress !== undefined) params['remote-address'] = secret.remoteAddress;
    if (secret.callerId !== undefined) params['caller-id'] = secret.callerId;
    if (secret.comment !== undefined) params.comment = secret.comment;
    if (secret.disabled !== undefined) params.disabled = secret.disabled ? 'yes' : 'no';

    await this.runCommand('ppp/secret', 'set', params);
    return { name, ...secret, routerId: this.config.id, routerName: this.config.name } as PppSecret;
  }

  async deleteSecret(name: string): Promise<boolean> {
    await this.runCommand('ppp/secret', 'remove', { numbers: name });
    return true;
  }

  async setSecretDisabled(name: string, disabled: boolean): Promise<boolean> {
    const action = disabled ? 'disable' : 'enable';
    await this.runCommand('ppp/secret', action, { numbers: name });
    return true;
  }

  async getActive(): Promise<PppActive[]> {
    const raw = await this.runCommand('ppp/active', 'print');
    return raw.map((item) => ({
      name: item.name,
      service: item.service || 'pppoe',
      callerId: item['caller-id'],
      address: item.address,
      uptime: item.uptime,
      encoding: item.encoding,
      routerId: this.config.id,
      routerName: this.config.name,
    }));
  }

  async disconnectActive(name: string): Promise<boolean> {
    await this.runCommand('ppp/active', 'remove', { numbers: name });
    return true;
  }

  async getProfiles(): Promise<PppProfile[]> {
    const raw = await this.runCommand('ppp/profile', 'print');
    return raw.map((item) => ({
      name: item.name,
      localAddress: item['local-address'],
      remoteAddress: item['remote-address'],
      rateLimit: item['rate-limit'],
      parentQueue: item['parent-queue'],
      onlyOne: item['only-one'] === 'yes' || item['only-one'] === true,
      dnsServer: item['dns-server'],
      comment: item.comment,
      routerId: this.config.id,
      routerName: this.config.name,
    }));
  }

  async createProfile(profile: PppProfile): Promise<PppProfile> {
    const params: Record<string, any> = {
      name: profile.name,
    };
    if (profile.localAddress) params['local-address'] = profile.localAddress;
    if (profile.remoteAddress) params['remote-address'] = profile.remoteAddress;
    if (profile.rateLimit) params['rate-limit'] = profile.rateLimit;
    if (profile.parentQueue) params['parent-queue'] = profile.parentQueue;
    if (profile.onlyOne !== undefined) params['only-one'] = profile.onlyOne ? 'yes' : 'no';
    if (profile.dnsServer) params['dns-server'] = profile.dnsServer;
    if (profile.comment) params.comment = profile.comment;

    await this.runCommand('ppp/profile', 'add', params);
    return { ...profile, routerId: this.config.id, routerName: this.config.name };
  }

  async updateProfile(name: string, profile: Partial<PppProfile>): Promise<PppProfile> {
    const params: Record<string, any> = { numbers: name };
    if (profile.localAddress !== undefined) params['local-address'] = profile.localAddress;
    if (profile.remoteAddress !== undefined) params['remote-address'] = profile.remoteAddress;
    if (profile.rateLimit !== undefined) params['rate-limit'] = profile.rateLimit;
    if (profile.parentQueue !== undefined) params['parent-queue'] = profile.parentQueue;
    if (profile.onlyOne !== undefined) params['only-one'] = profile.onlyOne ? 'yes' : 'no';
    if (profile.dnsServer !== undefined) params['dns-server'] = profile.dnsServer;
    if (profile.comment !== undefined) params.comment = profile.comment;

    await this.runCommand('ppp/profile', 'set', params);
    return { name, ...profile, routerId: this.config.id, routerName: this.config.name } as PppProfile;
  }

  async deleteProfile(name: string): Promise<boolean> {
    await this.runCommand('ppp/profile', 'remove', { numbers: name });
    return true;
  }

  async getQueues(): Promise<SimpleQueue[]> {
    const raw = await this.runCommand('queue/simple', 'print');
    return raw.map((item) => ({
      name: item.name,
      target: item.target,
      maxLimit: item['max-limit'],
      limitAt: item['limit-at'],
      priority: item.priority,
      comment: item.comment,
      parent: item.parent && item.parent !== 'none' ? item.parent : undefined,
      routerId: this.config.id,
      routerName: this.config.name,
    }));
  }

  async createQueue(queue: SimpleQueue): Promise<SimpleQueue> {
    const params: Record<string, any> = {
      name: queue.name,
      target: queue.target || '0.0.0.0/0',
    };
    if (queue.maxLimit) params['max-limit'] = queue.maxLimit;
    if (queue.limitAt) params['limit-at'] = queue.limitAt;
    if (queue.priority) params.priority = queue.priority;
    if (queue.parent) params.parent = queue.parent;
    if (queue.comment) params.comment = queue.comment;

    await this.runCommand('queue/simple', 'add', params);
    return { ...queue, routerId: this.config.id, routerName: this.config.name };
  }

  async updateQueue(name: string, queue: Partial<SimpleQueue>): Promise<SimpleQueue> {
    const params: Record<string, any> = { numbers: name };
    if (queue.target !== undefined) params.target = queue.target;
    if (queue.maxLimit !== undefined) params['max-limit'] = queue.maxLimit;
    if (queue.limitAt !== undefined) params['limit-at'] = queue.limitAt;
    if (queue.priority !== undefined) params.priority = queue.priority;
    if (queue.parent !== undefined) params.parent = queue.parent || 'none';
    if (queue.comment !== undefined) params.comment = queue.comment;

    await this.runCommand('queue/simple', 'set', params);
    return { name, ...queue, routerId: this.config.id, routerName: this.config.name } as SimpleQueue;
  }

  async deleteQueue(name: string): Promise<boolean> {
    await this.runCommand('queue/simple', 'remove', { numbers: name });
    return true;
  }

  async getPools(): Promise<IpPool[]> {
    const raw = await this.runCommand('ip/pool', 'print');
    return raw.map((item) => ({
      name: item.name,
      ranges: item.ranges,
      nextPool: item['next-pool'] && item['next-pool'] !== 'none' ? item['next-pool'] : undefined,
      comment: item.comment,
      routerId: this.config.id,
      routerName: this.config.name,
    }));
  }

  async createPool(pool: IpPool): Promise<IpPool> {
    const params: Record<string, any> = {
      name: pool.name,
      ranges: pool.ranges,
    };
    if (pool.nextPool) params['next-pool'] = pool.nextPool;
    if (pool.comment) params.comment = pool.comment;

    await this.runCommand('ip/pool', 'add', params);
    return { ...pool, routerId: this.config.id, routerName: this.config.name };
  }

  async updatePool(name: string, pool: Partial<IpPool>): Promise<IpPool> {
    const params: Record<string, any> = { numbers: name };
    if (pool.ranges !== undefined) params.ranges = pool.ranges;
    if (pool.nextPool !== undefined) params['next-pool'] = pool.nextPool || 'none';
    if (pool.comment !== undefined) params.comment = pool.comment;

    await this.runCommand('ip/pool', 'set', params);
    return { name, ...pool, routerId: this.config.id, routerName: this.config.name } as IpPool;
  }

  async deletePool(name: string): Promise<boolean> {
    await this.runCommand('ip/pool', 'remove', { numbers: name });
    return true;
  }
}
