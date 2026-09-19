/**
 * Invitations / Referrals Management
 *
 * Reads real referral stats and referrer list from the backend and edits the
 * referral bonus settings. The previous version rendered fabricated sample
 * stats and referrers and never persisted the settings.
 */

let referrers = [];

async function loadReferralStats() {
    const data = await apiRequest('/admin/referrals/stats');
    if (!data || !data.success) return;

    const s = data.data;
    setText('totalReferrals', s.totalReferrals);
    setText('completedReferrals', s.activeReferrals);
    setText('totalRewards', formatCurrency(s.totalRewards));

    // Conversion = active / total referrals.
    const conversion = s.totalReferrals > 0
        ? Math.round((s.activeReferrals / s.totalReferrals) * 1000) / 10
        : 0;
    setText('conversionRate', `${conversion}%`);
}

async function loadReferralSettings() {
    const data = await apiRequest('/admin/settings/referrals');
    if (!data || !data.success) return;

    const bonus = data.data.bonusPercent ?? '';
    const signup = data.data.signupBonus ?? '';
    setText('referralBonus', bonus === '' ? '—' : `${bonus}%`);
    setText('signupBonus', signup === '' ? '—' : formatCurrency(signup));
    // These two are program policy, not stored yet; shown as fixed labels.
    setText('maxReferrals', 'Unlimited');
    setText('linkValidity', 'Forever');
}

async function loadReferrers() {
    const tbody = document.getElementById('referralsTable');
    if (tbody) {
        tbody.innerHTML =
            '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af;">Loading...</td></tr>';
    }

    const data = await apiRequest('/admin/referrals');
    referrers = data && data.success ? data.data : [];

    renderReferrers(referrers);
    setText('totalRecords', referrers.length);
    setText('showingStart', referrers.length ? 1 : 0);
    setText('showingEnd', referrers.length);
}

function renderReferrers(rows) {
    const tbody = document.getElementById('referralsTable');
    if (!tbody) return;

    if (rows.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af;">No referrers yet</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((r) => `
        <tr>
            <td>
                <strong>${escapeHtml(r.username)}</strong><br>
                <small>${escapeHtml(r.email)}</small>
            </td>
            <td><code>${escapeHtml(r.referral_code || '')}</code></td>
            <td>${Number(r.referral_count) || 0}</td>
            <td>${formatCurrency(r.total_earned)}</td>
            <td><span class="badge-status approved">ACTIVE</span></td>
            <td>—</td>
        </tr>
    `).join('');
}

// Client-side search over the already-loaded referrers.
function initSearch() {
    const input = document.getElementById('searchReferrals');
    if (!input) return;
    input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase();
        const filtered = referrers.filter((r) =>
            (r.username || '').toLowerCase().includes(q) ||
            (r.email || '').toLowerCase().includes(q)
        );
        renderReferrers(filtered);
    });
}

/**
 * Edit the referral bonus settings. Uses prompts to stay compatible with the
 * existing markup (which has no settings form), and persists via
 * PUT /admin/settings/referrals.
 */
async function editReferralSettings() {
    const current = await apiRequest('/admin/settings/referrals');
    const cur = current && current.success ? current.data : {};

    const bonusPercent = prompt('Referral bonus percentage (%)', cur.bonusPercent ?? '5');
    if (bonusPercent === null) return;

    const signupBonus = prompt('Sign-up bonus (USDT)', cur.signupBonus ?? '2');
    if (signupBonus === null) return;

    const data = await apiRequest('/admin/settings/referrals', {
        method: 'PUT',
        body: JSON.stringify({
            bonusPercent: parseFloat(bonusPercent) || 0,
            signupBonus: parseFloat(signupBonus) || 0
        })
    });

    if (data && data.success) {
        showNotification('Referral settings saved', 'success');
        loadReferralSettings();
    } else {
        showNotification((data && data.message) || 'Failed to save settings', 'error');
    }
}

// Export the currently loaded referrers to CSV.
function exportReferrals() {
    if (referrers.length === 0) {
        showNotification('No referrers to export', 'info');
        return;
    }

    const header = ['Username', 'Email', 'Referral Code', 'Referrals', 'Total Earned'];
    const rows = referrers.map((r) => [
        r.username,
        r.email,
        r.referral_code || '',
        Number(r.referral_count) || 0,
        parseFloat(r.total_earned) || 0
    ]);

    // Quote every field and escape embedded quotes so commas/quotes are safe.
    const csv = [header, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referrals-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

// ── Invite codes ────────────────────────────────────────────────────

async function loadInviteCodes() {
    const tbody = document.getElementById('inviteCodesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#9ca3af;">Loading…</td></tr>';

    const data = await apiRequest('/admin/invite-codes?limit=50');
    if (!data || !data.success) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#ef4444;">Failed to load codes</td></tr>';
        return;
    }

    const { codes, counts } = data.data;
    setText('icActive', 'Active: ' + (counts.active || 0));
    setText('icUsed', 'Used: ' + (counts.used || 0));
    setText('icDisabled', 'Disabled: ' + (counts.disabled || 0));

    if (!codes.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:16px;color:#9ca3af;">No codes yet. Generate some above.</td></tr>';
        return;
    }

    tbody.innerHTML = codes.map(function (c) {
        const badge = c.status === 'active' ? 'approved' : (c.status === 'used' ? 'pending' : 'cancelled');
        const created = c.created_at ? formatDate(c.created_at) : '—';
        const actions = c.status === 'active'
            ? `<button class="btn btn-sm" style="background:#fff4ee;color:#FE5722;border:1px solid #ffd9c7;border-radius:6px;padding:5px 10px;cursor:pointer;margin-right:6px;" onclick="copyInvite('${c.code}')"><i class="fas fa-copy"></i></button>
               <button class="btn btn-sm btn-warning" style="border:none;border-radius:6px;padding:5px 10px;cursor:pointer;margin-right:6px;" onclick="disableInvite(${c.id})">Disable</button>
               <button class="btn btn-sm btn-danger" style="border:none;border-radius:6px;padding:5px 10px;cursor:pointer;" onclick="deleteInvite(${c.id})"><i class="fas fa-trash"></i></button>`
            : (c.status === 'disabled'
                ? `<button class="btn btn-sm btn-danger" style="border:none;border-radius:6px;padding:5px 10px;cursor:pointer;" onclick="deleteInvite(${c.id})"><i class="fas fa-trash"></i></button>`
                : '<span style="color:#9ca3af;">—</span>');
        return `
            <tr>
                <td style="font-family:monospace;font-weight:700;letter-spacing:1px;">${escapeHtml(c.code)}</td>
                <td><span class="badge-status ${badge}">${c.status.toUpperCase()}</span></td>
                <td>${escapeHtml(c.used_by_username || '—')}</td>
                <td>${escapeHtml(c.note || '—')}</td>
                <td>${created}</td>
                <td>${actions}</td>
            </tr>`;
    }).join('');
}

async function generateInviteCodes() {
    const count = parseInt(document.getElementById('inviteCount').value, 10) || 1;
    const note = document.getElementById('inviteNote').value.trim();
    const data = await apiRequest('/admin/invite-codes', {
        method: 'POST',
        body: JSON.stringify({ count, note })
    });
    if (data && data.success) {
        showNotification(data.message || 'Codes generated', 'success');
        document.getElementById('inviteNote').value = '';
        loadInviteCodes();
    } else {
        showNotification((data && data.message) || 'Failed to generate codes', 'error');
    }
}

function copyInvite(code) {
    navigator.clipboard.writeText(code).then(function () {
        showNotification('Copied: ' + code, 'success');
    }).catch(function () {});
}

async function disableInvite(id) {
    if (!confirm('Disable this code? It can no longer be used to register.')) return;
    const data = await apiRequest('/admin/invite-codes/' + id + '/disable', { method: 'POST', body: JSON.stringify({}) });
    if (data && data.success) { showNotification(data.message, 'success'); loadInviteCodes(); }
    else { showNotification((data && data.message) || 'Failed', 'error'); }
}

async function deleteInvite(id) {
    if (!confirm('Delete this code?')) return;
    const data = await apiRequest('/admin/invite-codes/' + id, { method: 'DELETE' });
    if (data && data.success) { showNotification(data.message, 'success'); loadInviteCodes(); }
    else { showNotification((data && data.message) || 'Failed', 'error'); }
}

document.addEventListener('DOMContentLoaded', () => {
    initSearch();
    loadReferralStats();
    loadReferralSettings();
    loadReferrers();
    loadInviteCodes();

    // Real-time: refresh stats, referrers and invite codes automatically.
    // (Skip loadReferralSettings so an edited settings form isn't clobbered.)
    if (typeof registerAutoRefresh === 'function') {
        registerAutoRefresh(() => { loadReferralStats(); loadReferrers(); loadInviteCodes(); });
    }
});
