import { Router, Response } from 'express';
import { routerManager } from '../drivers/manager.js';
import { storage } from '../storage.js';
import { AuthenticatedRequest } from '../auth.js';
import { PppProfile } from '../drivers/types.js';

const router = Router({ mergeParams: true });

// GET profiles
router.get('/', async (req, res: Response) => {
  const routerId = (req.params as any).routerId;
  try {
    const { data, errors } = await routerManager.executeOnRouters<PppProfile>(
      routerId,
      async (driver) => {
        return driver.getProfiles();
      }
    );
    res.json({ success: true, data, errors: Object.keys(errors).length > 0 ? errors : undefined });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Gagal mengambil data profile' });
  }
});

// POST create profile
router.post('/', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const { name, localAddress, remoteAddress, rateLimit, parentQueue, onlyOne, dnsServer, comment } = req.body;

  if (!name) {
    return res.status(400).json({ success: false, error: 'Nama profile wajib diisi.' });
  }

  try {
    const targets = await routerManager.getTargetDrivers(routerId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    const newProfile = await driver.createProfile({
      name: name.trim(),
      localAddress: localAddress?.trim() || undefined,
      remoteAddress: remoteAddress?.trim() || undefined,
      rateLimit: rateLimit?.trim() || undefined,
      parentQueue: parentQueue?.trim() || undefined,
      onlyOne: onlyOne !== undefined ? Boolean(onlyOne) : true,
      dnsServer: dnsServer?.trim() || undefined,
      comment: comment?.trim() || undefined,
    });

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'CREATE',
      targetType: 'PROFILE',
      targetName: newProfile.name,
      details: `Membuat PPP profile baru '${newProfile.name}' (Rate: ${newProfile.rateLimit || 'unlimited'})`,
    });

    res.status(201).json({ success: true, data: newProfile });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal membuat profile' });
  }
});

// PUT update profile
router.put('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const profileName = req.params.name;
  const patch = req.body;

  try {
    const targets = await routerManager.getTargetDrivers(routerId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    const updated = await driver.updateProfile(profileName, patch);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'UPDATE',
      targetType: 'PROFILE',
      targetName: profileName,
      details: `Memperbarui profile '${profileName}'`,
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal memperbarui profile' });
  }
});

// DELETE profile
router.delete('/:name', async (req: AuthenticatedRequest, res: Response) => {
  const routerId = (req.params as any).routerId;
  const profileName = req.params.name;

  try {
    const targets = await routerManager.getTargetDrivers(routerId);
    if (targets.length === 0) {
      return res.status(404).json({ success: false, error: 'Router tidak ditemukan.' });
    }
    const { config, driver } = targets[0];

    await driver.deleteProfile(profileName);

    storage.addAuditLog({
      username: req.user?.username || 'admin',
      routerId: config.id,
      routerName: config.name,
      action: 'DELETE',
      targetType: 'PROFILE',
      targetName: profileName,
      details: `Menghapus profile '${profileName}'`,
    });

    res.json({ success: true, message: `Profile '${profileName}' berhasil dihapus.` });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || 'Gagal menghapus profile' });
  }
});

export default router;
