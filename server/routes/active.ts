import { Router, Response } from 'express';
import { routerManager } from '../drivers/manager.js';
import { storage } from '../storage.js';
import { AuthenticatedRequest } from '../auth.js';
import { PppActive } from '../drivers/types.js';

const router = Router({ mergeParams: true });

// GET active sessions
router.get('/', async (req, res: Response) => {
  const routerId = (req.params as any).routerId;
  try {
    const { data, errors } = await routerManager.executeOnRouters<PppActive>(
      routerId,
      async (driver) => {
        return driver.getActive();
      }
    );
    res.json({ success: true, data, errors: Object.keys(errors).length > 0 ? errors : undefined });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil data sesi aktif' });
  }
});

// DELETE disconnect active session
router.delete('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const sessionName = req.params.name;
  const targetRouterId = (req.query.routerId as string) || routerId;

  try {
    const targets = await routerManager.getTargetDrivers(targetRouterId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    await driver.disconnectActive(sessionName);

    storage.addRecentEvent({
      type: 'disconnected',
      username: sessionName,
      routerName: config.name,
      ipAddress: 'PPPoE Client',
    });

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'DISCONNECT',
      targetType: 'ACTIVE',
      targetName: sessionName,
      details: `Memutus sesi aktif '${sessionName}' (Kick)`,
    });

    res.json({ success: true, message: `Sesi aktif '${sessionName}' berhasil diputuskan.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal memutuskan sesi' });
  }
});

// POST bulk disconnect
router.post('/bulk-disconnect', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const { items } = req.body; // items: Array<{ name: string, routerId?: string }>

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Daftar sesi yang akan diputus wajib diisi.' });
  }

  try {
    let count = 0;
    for (const item of items) {
      const targetRouterId = item.routerId || routerId;
      try {
        const targets = await routerManager.getTargetDrivers(targetRouterId);
        if (targets.length === 0) continue;
        const { driver, config } = targets[0];
        await driver.disconnectActive(item.name);
        storage.addRecentEvent({
          type: 'disconnected',
          username: item.name,
          routerName: config.name,
          ipAddress: 'PPPoE Client',
        });
        count++;
      } catch {}
    }

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: routerId,
      routerName: routerId === 'all' ? 'Semua Router' : routerId,
      action: 'DISCONNECT',
      targetType: 'ACTIVE',
      targetName: `${count} sesi`,
      details: `Memutus massal ${count} dari ${items.length} sesi aktif`,
    });

    res.json({ success: true, disconnectedCount: count });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal memutus sesi' });
  }
});

export default router;
