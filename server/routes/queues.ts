import { Router, Response } from 'express';
import { routerManager } from '../drivers/manager.js';
import { storage } from '../storage.js';
import { AuthenticatedRequest } from '../auth.js';
import { SimpleQueue } from '../drivers/types.js';

const router = Router({ mergeParams: true });

// GET queues
router.get('/', async (req, res: Response) => {
  const routerId = (req.params as any).routerId;
  try {
    const { data, errors } = await routerManager.executeOnRouters<SimpleQueue>(
      routerId,
      async (driver) => {
        return driver.getQueues();
      }
    );
    res.json({ success: true, data, errors: Object.keys(errors).length > 0 ? errors : undefined });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil data queue' });
  }
});

// POST create queue
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const { name, target, maxLimit, limitAt, priority, parent, comment } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Nama queue wajib diisi.' });
  }

  try {
    const targets = await routerManager.getTargetDrivers(routerId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    const newQueue = await driver.createQueue({
      name: name.trim(),
      target: target?.trim() || '0.0.0.0/0',
      maxLimit: maxLimit?.trim() || undefined,
      limitAt: limitAt?.trim() || undefined,
      priority: priority?.trim() || '8',
      parent: parent && parent !== 'none' ? parent.trim() : undefined,
      comment: comment?.trim() || undefined,
    });

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'CREATE',
      targetType: 'QUEUE',
      targetName: newQueue.name,
      details: `Membuat Simple Queue '${newQueue.name}' (${newQueue.maxLimit || 'unlimited'})`,
    });

    res.status(201).json({ success: true, data: newQueue });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal membuat queue' });
  }
});

// PUT update queue
router.put('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const queueName = req.params.name;
  const patch = req.body;

  try {
    const targets = await routerManager.getTargetDrivers(routerId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    const updated = await driver.updateQueue(queueName, patch);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'UPDATE',
      targetType: 'QUEUE',
      targetName: queueName,
      details: `Memperbarui Simple Queue '${queueName}'`,
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal memperbarui queue' });
  }
});

// DELETE queue
router.delete('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const queueName = req.params.name;

  try {
    const targets = await routerManager.getTargetDrivers(routerId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    await driver.deleteQueue(queueName);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'DELETE',
      targetType: 'QUEUE',
      targetName: queueName,
      details: `Menghapus Simple Queue '${queueName}'`,
    });

    res.json({ success: true, message: `Queue '${queueName}' berhasil dihapus.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal menghapus queue' });
  }
});

export default router;
