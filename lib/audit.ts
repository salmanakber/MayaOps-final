import prisma from './prisma';

export interface AuditLogEntry {
  companyId: number;
  userId: number;
  action: string; // Made flexible to support any action type
  entityType: 'user' | 'task' | 'property' | 'company' | 'photo' | 'note' | 'billing';
  entityId: number | string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: entry.companyId,
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId.toString(),
        oldValues: entry.oldValues ? JSON.stringify(entry.oldValues) : null,
        newValues: entry.newValues ? JSON.stringify(entry.newValues) : null,
        ipAddress: entry.ipAddress || null,
        userAgent: entry.userAgent || null,
      },
    });
  } catch (error) {
    console.error('Audit log error:', error);
    // Don't throw - audit logging should not break main functionality
  }
}

export async function getAuditLogs(
  companyId: number,
  filters?: {
    userId?: number;
    action?: string;
    entityType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }
): Promise<any[]> {
  try {
    const where: any = {
      companyId,
    };

    if (filters?.userId) {
      where.userId = filters.userId;
    }

    if (filters?.action) {
      where.action = filters.action;
    }

    if (filters?.entityType) {
      where.entityType = filters.entityType;
    }

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.createdAt.lte = filters.endDate;
      }
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 100,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    // Format response to match expected structure
    return logs.map(log => ({
      id: log.id,
      company_id: log.companyId,
      user_id: log.userId,
      action: log.action,
      entity_type: log.entityType,
      entity_id: log.entityId,
      old_values: log.oldValues,
      new_values: log.newValues,
      ip_address: log.ipAddress,
      user_agent: log.userAgent,
      created_at: log.createdAt,
      user: log.user,
    }));
  } catch (error) {
    console.error('Get audit logs error:', error);
    return [];
  }
}

export async function exportAuditLogs(
  companyId: number,
  startDate: Date,
  endDate: Date
): Promise<string> {
  try {
    const logs = await getAuditLogs(companyId, {
      startDate,
      endDate,
      limit: 10000,
    });

    // Convert to CSV format
    const headers = ['Timestamp', 'User ID', 'User Name', 'Action', 'Entity Type', 'Entity ID', 'Changes', 'IP Address'];
    const rows = logs.map(log => {
      const userName = log.user 
        ? `${log.user.firstName || ''} ${log.user.lastName || ''}`.trim() || log.user.email
        : `User ${log.user_id}`;
      
      let changes = 'N/A';
      if (log.old_values && log.new_values) {
        try {
          const oldVals = typeof log.old_values === 'string' ? JSON.parse(log.old_values) : log.old_values;
          const newVals = typeof log.new_values === 'string' ? JSON.parse(log.new_values) : log.new_values;
          changes = `${JSON.stringify(oldVals)} → ${JSON.stringify(newVals)}`;
        } catch {
          changes = `${log.old_values} → ${log.new_values}`;
        }
      }

      return [
        new Date(log.created_at).toISOString(),
        log.user_id,
        userName,
        log.action,
        log.entity_type,
        log.entity_id,
        changes,
        log.ip_address || 'N/A',
      ];
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return csv;
  } catch (error) {
    console.error('Export audit logs error:', error);
    throw error;
  }
}
