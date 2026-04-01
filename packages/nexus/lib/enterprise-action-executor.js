'use strict';

function compactText(value, max = 4000) {
  return String(value || '')
    .replace(/\r/g, '')
    .trim()
    .slice(0, max);
}

function slugify(value, fallback = 'artifact') {
  const slug = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalizeRecipients(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[,\n;]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function parseLooseBoolean(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return ['1', 'true', 'yes', 'y', 'on'].includes(normalized);
}

function parseLooseNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeColumnKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function tryParseJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return fallback;
  }
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    const parsed = tryParseJson(value, null);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item || '').trim()).filter(Boolean);
    return value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function extractLlmText(response) {
  if (!response) return '';
  if (typeof response === 'string') return response;
  if (typeof response.content === 'string') return response.content;

  const choiceContent = response.choices?.[0]?.message?.content;
  if (typeof choiceContent === 'string') return choiceContent;
  if (Array.isArray(choiceContent)) {
    return choiceContent.map((item) => item?.text || item?.content || '').join('\n').trim();
  }

  const messageContent = response.message?.content;
  if (typeof messageContent === 'string') return messageContent;

  return response.raw || '';
}

function buildMarkdownSection(title, body) {
  const content = compactText(body, 12000);
  if (!content) return '';
  return `## ${title}\n\n${content}`;
}

class EnterpriseActionExecutor {
  constructor(providers = {}) {
    this.providers = providers;
  }

  async execute(input = {}, options = {}) {
    const actionKey = input.actionKey || input.action_key;
    const args = input.args || {};
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    switch (actionKey) {
      case 'summarize_rfp':
        return { handled: true, result: await this._summarizeRfp(args, onProgress) };
      case 'assemble_bid_sources':
        return { handled: true, result: await this._assembleBidSources(args, onProgress) };
      case 'draft_bid_outline':
        return { handled: true, result: await this._draftBidOutline(args, onProgress) };
      case 'draft_bid_email':
        return { handled: true, result: await this._draftBidEmail(args, onProgress) };
      case 'summarize_inputs':
        return { handled: true, result: await this._summarizeInputs(args, onProgress) };
      case 'draft_report':
        return { handled: true, result: await this._draftReport(args, onProgress) };
      case 'compile_sections':
        return { handled: true, result: await this._compileSections(args, onProgress) };
      case 'prepare_delivery_email':
      case 'send_daily_report':
      case 'send_incident_summary':
        return { handled: true, result: await this._prepareDeliveryEmail(args, onProgress, actionKey) };
      case 'check_room_health':
        return { handled: true, result: await this._checkRoomHealth(args, onProgress) };
      case 'get_room_diagnostics':
        return { handled: true, result: await this._getRoomDiagnostics(args, onProgress) };
      case 'restart_room_system':
        return { handled: true, result: await this._restartRoomSystem(args, onProgress) };
      case 'open_incident_ticket':
        return { handled: true, result: await this._openIncidentTicket(args, onProgress) };
      case 'provision_room_event_subscription':
        return { handled: true, result: await this._provisionRoomEventSubscription(args, onProgress) };
      default:
        return { handled: false, result: null };
    }
  }

  async _summarizeRfp(args, onProgress) {
    this._progress(onProgress, 'collecting', 'Collecting RFP inputs');
    const context = await this._buildContext(args, {
      includeKnowledge: args.includeKnowledge !== false,
      maxDocs: args.maxDocs || 3,
      maxExcerpt: 5000,
    });

    this._progress(onProgress, 'rendering', 'Summarizing RFP inputs');
    const summary = await this._renderWithFallback({
      kind: 'rfp_summary',
      title: args.title || 'RFP Summary',
      instructions: args.instructions || 'Summarize the request for proposal, key requirements, deadlines, deliverables, constraints, and response risks.',
      context,
      fallback: this._fallbackSummarizeContext('RFP Summary', context),
    });

    return this._success('workspace_knowledge_retriever,workspace_document_picker,report_template_renderer', {
      summary,
      selectedDocuments: context.documents.map((doc) => this._documentMeta(doc)),
      knowledgeUsed: context.knowledgeUsed,
    });
  }

  async _assembleBidSources(args, onProgress) {
    this._progress(onProgress, 'collecting', 'Collecting bid sources');
    const context = await this._buildContext(args, {
      includeKnowledge: args.includeKnowledge !== false,
      maxDocs: args.maxDocs || 8,
      maxExcerpt: 2500,
    });

    const assembled = {
      selectedDocuments: context.documents.map((doc) => ({
        ...this._documentMeta(doc),
        excerpt: compactText(doc.content, 1200),
      })),
      knowledgeSnippet: compactText(context.knowledge, 2400),
      notes: compactText(args.notes || '', 1200),
    };

    return this._success('workspace_knowledge_retriever,workspace_document_picker', assembled);
  }

  async _draftBidOutline(args, onProgress) {
    this._progress(onProgress, 'collecting', 'Collecting sources for bid outline');
    const context = await this._buildContext(args, {
      includeKnowledge: args.includeKnowledge !== false,
      maxDocs: args.maxDocs || 4,
      maxExcerpt: 3500,
    });

    this._progress(onProgress, 'rendering', 'Rendering bid outline');
    const markdown = await this._renderWithFallback({
      kind: 'bid_outline',
      title: args.title || 'Bid Response Outline',
      instructions: args.instructions || 'Draft a structured bid response outline with executive summary, scope, delivery, assumptions, risks, and next steps.',
      context,
      fallback: this._fallbackBidOutline(args, context),
    });

    return this._success('workspace_knowledge_retriever,workspace_document_picker,report_template_renderer', {
      format: 'markdown',
      title: args.title || 'Bid Response Outline',
      markdown,
      selectedDocuments: context.documents.map((doc) => this._documentMeta(doc)),
      knowledgeUsed: context.knowledgeUsed,
      artifactName: `${slugify(args.title || 'bid-outline')}.md`,
    });
  }

  async _draftBidEmail(args, onProgress) {
    this._progress(onProgress, 'rendering', 'Drafting bid delivery email');
    const context = await this._buildContext(args, {
      includeKnowledge: false,
      maxDocs: args.maxDocs || 2,
      maxExcerpt: 1800,
    });

    const body = await this._renderWithFallback({
      kind: 'bid_email',
      title: args.subject || 'Bid Submission Draft',
      instructions: args.instructions || 'Draft a concise professional email for a bid or proposal submission. Mention the proposal title, included materials, and next steps.',
      context,
      fallback: this._fallbackDeliveryEmail({
        subject: args.subject || 'Bid submission draft',
        recipientName: args.recipientName || args.contactName || 'there',
        summary: compactText(args.summary || context.summary || 'Attached is the requested bid response.', 1200),
      }),
    });

    const subject = args.subject || 'Bid submission draft';
    const payload = {
      subject,
      body,
      to: normalizeRecipients(args.to || args.recipients),
      from: args.from || undefined,
      send: Boolean(args.send || args.deliver),
    };

    const delivered = await this._maybeSendEmail(payload);

    return this._success('report_template_renderer,report_delivery_mailer', {
      ...payload,
      delivered,
    });
  }

  async _summarizeInputs(args, onProgress) {
    this._progress(onProgress, 'collecting', 'Collecting report inputs');
    const context = await this._buildContext(args, {
      includeKnowledge: args.includeKnowledge !== false,
      maxDocs: args.maxDocs || 5,
      maxExcerpt: 4000,
    });

    const summary = await this._renderWithFallback({
      kind: 'input_summary',
      title: args.title || 'Input Summary',
      instructions: args.instructions || 'Summarize the supplied workspace inputs into themes, findings, blockers, and action items.',
      context,
      fallback: this._fallbackSummarizeContext('Input Summary', context),
    });

    return this._success('workspace_knowledge_retriever,workspace_document_picker,report_template_renderer', {
      summary,
      selectedDocuments: context.documents.map((doc) => this._documentMeta(doc)),
      knowledgeUsed: context.knowledgeUsed,
    });
  }

  async _draftReport(args, onProgress) {
    this._progress(onProgress, 'collecting', 'Collecting report context');
    const context = await this._buildContext(args, {
      includeKnowledge: args.includeKnowledge !== false,
      maxDocs: args.maxDocs || 4,
      maxExcerpt: 4000,
    });

    const markdown = await this._renderWithFallback({
      kind: 'report_draft',
      title: args.title || 'Operational Report',
      instructions: args.instructions || 'Draft a structured operational report with executive summary, key findings, detailed sections, risks, and recommended next steps.',
      context,
      fallback: this._fallbackReport(args, context),
    });

    return this._success('workspace_knowledge_retriever,workspace_document_picker,report_template_renderer', {
      format: 'markdown',
      title: args.title || 'Operational Report',
      markdown,
      selectedDocuments: context.documents.map((doc) => this._documentMeta(doc)),
      artifactName: `${slugify(args.title || 'report')}.md`,
      knowledgeUsed: context.knowledgeUsed,
    });
  }

  async _compileSections(args, onProgress) {
    this._progress(onProgress, 'rendering', 'Compiling report sections');
    const sections = normalizeArray(args.sections).map((section, index) => {
      if (typeof section === 'string') {
        return { title: `Section ${index + 1}`, body: section };
      }
      return {
        title: section?.title || `Section ${index + 1}`,
        body: section?.body || section?.content || '',
      };
    });

    if (sections.length === 0) {
      throw new Error('compile_sections requires at least one section');
    }

    const markdown = [
      `# ${args.title || 'Compiled Report'}`,
      '',
      ...sections.map((section) => buildMarkdownSection(section.title, section.body)),
    ].filter(Boolean).join('\n\n');

    return this._success('report_template_renderer', {
      format: 'markdown',
      title: args.title || 'Compiled Report',
      markdown,
      sectionCount: sections.length,
      artifactName: `${slugify(args.title || 'compiled-report')}.md`,
    });
  }

  async _prepareDeliveryEmail(args, onProgress, actionKey) {
    this._progress(onProgress, 'rendering', 'Preparing delivery email');
    const summary = compactText(
      args.summary
        || args.report
        || args.body
        || (actionKey === 'send_daily_report' ? this._buildAvDailyReportSummary(args) : ''),
      2000
    );
    const body = await this._renderWithFallback({
      kind: 'delivery_email',
      title: args.subject || 'Report Delivery',
      instructions: args.instructions || 'Draft a concise delivery email for a report or summary, mentioning what is included and what happens next.',
      context: {
        knowledge: '',
        documents: [],
        knowledgeUsed: false,
        summary,
      },
      fallback: this._fallbackDeliveryEmail({
        subject: args.subject || 'Report delivery',
        recipientName: args.recipientName || args.contactName || 'there',
        summary,
      }),
    });

    const payload = {
      subject: args.subject || (
        actionKey === 'send_daily_report'
          ? 'Daily report'
          : actionKey === 'send_incident_summary'
            ? 'Incident summary'
            : 'Report delivery'
      ),
      body,
      to: normalizeRecipients(args.to || args.recipients),
      from: args.from || undefined,
      send: args.send !== false,
    };
    const delivered = await this._maybeSendEmail(payload);

    return this._success('report_template_renderer,report_delivery_mailer', {
      ...payload,
      delivered,
    });
  }

  async _checkRoomHealth(args, onProgress) {
    this._progress(onProgress, 'checking', 'Checking AV room health');
    const av = this.providers.av;
    if (!av) throw new Error('AV provider unavailable');

    const room = await this._resolveAvRoom(args);
    const result = await av.getRoomHealth(this._buildAvOptions(args, room));
    if (!result.success) {
      return this._failure('av_room_connector', result.error || 'Failed to check room health', { result });
    }

    return this._success('av_room_connector', {
      room: result.room,
      host: result.host,
      platform: result.platform,
      healthy: result.healthy,
      ping: result.ping,
      platformStatus: result.platformStatus,
    });
  }

  async _getRoomDiagnostics(args, onProgress) {
    this._progress(onProgress, 'diagnostics', 'Collecting AV room diagnostics');
    const av = this.providers.av;
    if (!av) throw new Error('AV provider unavailable');

    const room = await this._resolveAvRoom(args);
    const result = await av.getRoomDiagnostics(this._buildAvOptions(args, room));
    if (!result.success) {
      return this._failure('av_room_connector', result.error || 'Failed to collect room diagnostics', { result });
    }

    return this._success('av_room_connector,av_room_reporter', {
      diagnostics: result.diagnostics,
      summary: this._buildAvDiagnosticSummary(result.diagnostics),
    });
  }

  async _restartRoomSystem(args, onProgress) {
    this._progress(onProgress, 'remediation', 'Restarting room system');
    const av = this.providers.av;
    if (!av) throw new Error('AV provider unavailable');

    const room = await this._resolveAvRoom(args);
    const result = await av.restartRoomSystem(this._buildAvOptions(args, room));
    if (!result.success) {
      return this._failure('av_room_connector', result.error || 'Failed to restart room system', { result });
    }

    return this._success('av_room_connector', {
      room: room?.roomName || room?.room || args.roomName || args.room || null,
      platform: result.platform,
      host: result.host,
      strategy: result.strategy,
      response: result.response || null,
      powerOff: result.powerOff || null,
      powerOn: result.powerOn || null,
    });
  }

  async _openIncidentTicket(args, onProgress) {
    this._progress(onProgress, 'ticketing', 'Opening incident ticket');
    const jira = this.providers.workspaceJira;
    if (!jira) {
      return this._failure('av_ticketing_bridge', 'Workspace Jira provider unavailable', {});
    }

    const projectKey = args.projectKey || args.project_key;
    const summary = args.summary || `AV incident${args.roomName ? ` - ${args.roomName}` : ''}`;
    if (!projectKey) {
      return this._failure('av_ticketing_bridge', 'projectKey is required to open an incident ticket', {});
    }

    const description = [
      args.description || '',
      args.roomName ? `Room: ${args.roomName}` : '',
      args.host ? `Host: ${args.host}` : '',
      args.platform ? `Platform: ${args.platform}` : '',
      args.incidentSummary ? `Summary: ${args.incidentSummary}` : '',
    ].filter(Boolean).join('\n');

    const issue = await jira.createIssue({
      projectKey,
      summary,
      description,
      issueType: args.issueType || args.issue_type || 'Task',
      priority: args.priority || 'Medium',
      labels: normalizeArray(args.labels),
    });

    return this._success('av_ticketing_bridge', {
      issue,
      projectKey,
      summary,
    });
  }

  async _provisionRoomEventSubscription(args, onProgress) {
    this._progress(onProgress, 'subscription', 'Provisioning room event subscription');
    const provider = this.providers.workspaceEventSubscriptions;
    if (!provider) {
      return this._failure('av_event_subscription_manager', 'Workspace event subscription provider unavailable', {});
    }

    const room = await this._resolveAvRoom(args);
    const providerKey = String(args.provider || args.sourceProvider || args.subscriptionProvider || 'generic_http').trim().toLowerCase();
    const requestedProvisioningMode = String(args.provisioningMode || args.provisioning_mode || '').trim().toLowerCase();
    const provisioningMode = ['manual', 'assisted', 'automatic'].includes(requestedProvisioningMode)
      ? requestedProvisioningMode
      : (providerKey === 'microsoft_graph' ? 'assisted' : providerKey === 'generic_http' ? 'manual' : 'manual');
    const events = normalizeStringArray(args.events || args.eventTypes || args.event_types);
    const sourceResource = args.sourceResource || args.source_resource || room?.sourceResource || room?.roomName || room?.host || null;
    const config = {
      roomInventorySource: room?.inventorySource || null,
      roomReference: room || null,
      registrationHint: this._buildWebhookRegistrationHint(providerKey, {
        room,
        sourceResource,
        events,
        notificationUrlPlaceholder: '__CALLBACK_URL__',
        verificationSecretPlaceholder: '__WEBHOOK_SECRET__',
      }),
      webhookScope: args.webhookScope || args.scope || 'room_monitoring',
      autoRemediation: parseLooseBoolean(args.autoRemediation || args.auto_remediation),
    };

    const subscription = await provider.createSubscription({
      provider: providerKey,
      profileKey: args.profileKey || 'av_manager',
      agentId: args.agentId || null,
      subscriptionType: args.subscriptionType || 'room_event',
      sourceResource,
      roomName: room?.roomName || room?.room || args.roomName || args.room || null,
      events: events.length > 0 ? events : ['room.error', 'room.offline', 'room.device_disconnected'],
      status: args.status || 'active',
      deliveryMode: args.deliveryMode || (providerKey === 'microsoft_graph' ? 'hybrid' : 'manual'),
      provisioningMode,
      config,
    });

    const registrationHint = this._buildWebhookRegistrationHint(providerKey, {
      room,
      sourceResource,
      events: subscription.events,
      notificationUrlPlaceholder: subscription.callbackUrl,
      verificationSecretPlaceholder: subscription.verificationSecret,
    });

    return this._success('av_event_subscription_manager', {
      subscription: {
        ...subscription,
        config: {
          ...(subscription.config || {}),
          registrationHint,
        },
      },
      room,
      provisioningMode,
      registrationHint,
    });
  }

  async _buildContext(args, options = {}) {
    const documents = await this._pickWorkspaceDocuments(args, options);
    const knowledge = options.includeKnowledge ? await this._retrieveWorkspaceKnowledge(args) : '';
    const summary = compactText(
      normalizeArray(args.context).join('\n\n') || args.summary || args.prompt || '',
      4000
    );

    return {
      documents,
      knowledge,
      knowledgeUsed: Boolean(knowledge),
      summary,
    };
  }

  async _retrieveWorkspaceKnowledge(args) {
    const provider = this.providers.workspaceKnowledge;
    if (!provider) return '';
    const result = await provider.getWorkspaceKnowledge();
    const content = compactText(result.content || '', 6000);
    const query = compactText(args.query || args.searchQuery || args.topic || '', 800);
    if (!content || !query) return content;

    const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length > 2);
    if (terms.length === 0) return content;

    const lines = content.split('\n');
    const matched = lines.filter((line) => {
      const lowered = line.toLowerCase();
      return terms.some((term) => lowered.includes(term));
    });

    return compactText((matched.length > 0 ? matched : lines.slice(0, 60)).join('\n'), 6000);
  }

  async _pickWorkspaceDocuments(args, options = {}) {
    const drive = this.providers.workspaceDrive;
    if (!drive) return [];

    const results = [];
    const seen = new Set();
    const maxDocs = Number(options.maxDocs || 4);
    const maxExcerpt = Number(options.maxExcerpt || 3000);
    const paths = normalizeArray(args.documentPaths || args.paths);

    for (const item of paths) {
      if (results.length >= maxDocs) break;
      const normalizedPath = String(item);
      const folderPath = normalizedPath.includes('/') ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) || '/' : '/';
      const parentFiles = await drive.listFiles({ path: folderPath });
      const match = parentFiles.find((file) => file.path === normalizedPath || file.name === normalizedPath);
      if (!match || seen.has(match.id)) continue;
      const preview = await drive.previewFile(match.id, { path: folderPath });
      results.push({
        id: match.id,
        name: match.name,
        path: match.path,
        mimeType: preview.mimeType || match.mime_type || 'text/plain',
        content: compactText(preview.content || '', maxExcerpt),
      });
      seen.add(match.id);
    }

    if (results.length < maxDocs && (args.query || args.searchQuery || args.documentQuery)) {
      const matches = await drive.searchFiles({
        query: args.documentQuery || args.searchQuery || args.query,
        path: args.path || '/',
        limit: maxDocs * 2,
      });

      for (const match of matches) {
        if (results.length >= maxDocs) break;
        if (!match?.id || seen.has(match.id)) continue;
        const preview = await drive.previewFile(match.id, { path: args.path || '/' }).catch(() => null);
        results.push({
          id: match.id,
          name: match.name,
          path: match.path,
          mimeType: preview?.mimeType || match.mime_type || 'text/plain',
          content: compactText(preview?.content || match.content || '', maxExcerpt),
        });
        seen.add(match.id);
      }
    }

    if (results.length < maxDocs && args.path) {
      const fallbackFiles = await drive.listFiles({ path: args.path });
      for (const file of fallbackFiles) {
        if (results.length >= maxDocs) break;
        if (!file?.id || seen.has(file.id) || file.type === 'folder') continue;
        const preview = await drive.previewFile(file.id, { path: args.path }).catch(() => null);
        results.push({
          id: file.id,
          name: file.name,
          path: file.path,
          mimeType: preview?.mimeType || file.mime_type || 'text/plain',
          content: compactText(preview?.content || '', maxExcerpt),
        });
        seen.add(file.id);
      }
    }

    return results;
  }

  async _resolveAvRoom(args = {}) {
    const directRoom = this._normalizeRoomInventoryRow(args);
    const inventoryPath = args.inventoryPath || args.inventory_path || args.inventoryFilePath || args.inventory_file_path || args.roomInventoryPath || args.room_inventory_path || null;
    const inventoryFileId = args.inventoryFileId || args.inventory_file_id || null;

    if (!inventoryPath && !inventoryFileId) {
      return directRoom;
    }

    const inventory = await this._loadAvInventoryRows({
      inventoryPath,
      inventoryFileId,
      path: args.path || args.inventoryFolderPath || args.inventory_folder_path || '/',
    });

    if (!inventory.rows.length) {
      throw new Error('No AV inventory rows could be loaded from the provided file');
    }

    const matched = this._matchAvInventoryRow(inventory.rows, args, directRoom);
    if (!matched) {
      throw new Error('Could not resolve the requested room from the AV inventory');
    }

    return {
      ...matched,
      ...this._pickDefinedRoomFields(directRoom),
      inventorySource: inventory.sourcePath || inventoryPath || inventoryFileId,
      inventoryFileId: inventory.fileId || null,
    };
  }

  async _loadAvInventoryRows(options = {}) {
    const drive = this.providers.workspaceDrive;
    if (!drive) {
      throw new Error('Workspace drive provider unavailable');
    }

    const searchPath = options.path || '/';
    let file = null;

    if (options.inventoryFileId) {
      file = { id: options.inventoryFileId, path: searchPath };
    } else if (options.inventoryPath) {
      file = await this._resolveDriveFileByPath(options.inventoryPath, searchPath);
    }

    if (!file?.id) {
      throw new Error('AV inventory file not found');
    }

    const parsed = await drive.parseFile(file.id, { path: file.lookupPath || searchPath });
    const tables = Array.isArray(parsed?.tables) ? parsed.tables : [];
    const rows = [];

    for (const table of tables) {
      for (const row of normalizeArray(table?.rows)) {
        const normalized = this._normalizeRoomInventoryRow(row);
        if (!normalized.roomName && !normalized.host && !normalized.sourceResource) continue;
        rows.push(normalized);
      }
    }

    return {
      rows,
      fileId: file.id,
      sourcePath: file.path || options.inventoryPath || null,
      parsedType: parsed?.type || null,
    };
  }

  async _resolveDriveFileByPath(inventoryPath, fallbackPath = '/') {
    const drive = this.providers.workspaceDrive;
    const normalized = String(inventoryPath || '').trim();
    if (!normalized) return null;

    const folderPath = normalized.includes('/')
      ? normalized.slice(0, normalized.lastIndexOf('/')) || '/'
      : fallbackPath || '/';
    const parentFiles = await drive.listFiles({ path: folderPath }).catch(() => []);
    const exact = parentFiles.find((file) => file.path === normalized || file.name === normalized || file.name === normalized.split('/').pop());
    if (exact?.id) {
      return {
        id: exact.id,
        path: exact.path || normalized,
        lookupPath: folderPath,
      };
    }

    const matches = await drive.searchFiles({
      query: normalized.split('/').pop() || normalized,
      path: fallbackPath || '/',
      limit: 20,
    }).catch(() => []);
    const searchMatch = matches.find((file) => file.path === normalized)
      || matches.find((file) => file.name === normalized.split('/').pop())
      || matches[0];
    if (!searchMatch?.id) return null;

    return {
      id: searchMatch.id,
      path: searchMatch.path || normalized,
      lookupPath: searchMatch.path?.includes('/')
        ? searchMatch.path.slice(0, searchMatch.path.lastIndexOf('/')) || '/'
        : fallbackPath || '/',
    };
  }

  _matchAvInventoryRow(rows = [], args = {}, directRoom = {}) {
    const identifiers = [
      args.roomName,
      args.room,
      args.roomId,
      args.host,
      args.sourceResource,
      directRoom.roomName,
      directRoom.roomId,
      directRoom.host,
      directRoom.sourceResource,
    ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);

    if (identifiers.length === 0) {
      return rows.length === 1 ? rows[0] : null;
    }

    const exact = rows.find((row) => {
      const candidates = [
        row.roomName,
        row.room,
        row.roomId,
        row.host,
        row.sourceResource,
      ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
      return identifiers.some((identifier) => candidates.includes(identifier));
    });
    if (exact) return exact;

    return rows.find((row) => {
      const haystack = [
        row.roomName,
        row.room,
        row.roomId,
        row.host,
        row.sourceResource,
      ].map((value) => String(value || '').trim().toLowerCase()).join(' ');
      return identifiers.some((identifier) => haystack.includes(identifier));
    }) || null;
  }

  _normalizeRoomInventoryRow(row = {}) {
    const source = normalizeObject(row);
    const entries = Object.entries(source).reduce((acc, [key, value]) => {
      acc[normalizeColumnKey(key)] = value;
      return acc;
    }, {});
    const read = (...keys) => {
      for (const key of keys) {
        const value = entries[normalizeColumnKey(key)];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
      return null;
    };

    const authPayload = tryParseJson(read('auth', 'authentication', 'auth_json'), {});
    const restartPayload = tryParseJson(read('restart_request', 'restart', 'restart_json'), {});
    const snmpPayload = tryParseJson(read('snmp', 'snmp_json'), {});
    const diagnosticsPayload = tryParseJson(read('extra_http_paths', 'diagnostics_paths', 'health_paths', 'extra_checks'), []);

    const auth = {
      ...normalizeObject(authPayload),
      type: read('auth_type', 'authentication_type') || authPayload.type || null,
      username: read('username', 'user', 'login') || authPayload.username || null,
      password: read('password', 'pass', 'secret') || authPayload.password || null,
      token: read('token', 'access_token', 'bearer_token') || authPayload.token || null,
      headerName: read('auth_header_name', 'header_name') || authPayload.headerName || null,
      headerValue: read('auth_header_value', 'header_value', 'api_key') || authPayload.headerValue || null,
    };
    const hasAuth = Object.values(auth).some((value) => value !== null && value !== undefined && String(value).trim() !== '');

    const restartRequest = {
      ...normalizeObject(restartPayload),
      path: read('restart_path', 'reboot_path') || restartPayload.path || null,
      method: read('restart_method', 'reboot_method') || restartPayload.method || null,
      body: tryParseJson(read('restart_body', 'reboot_body'), restartPayload.body || null),
      port: parseLooseNumber(read('restart_port', 'reboot_port')) || restartPayload.port || null,
      protocol: read('restart_protocol', 'reboot_protocol') || restartPayload.protocol || null,
    };

    const snmp = {
      ...normalizeObject(snmpPayload),
      community: read('snmp_community', 'community') || snmpPayload.community || null,
      oid: read('snmp_oid', 'oid') || snmpPayload.oid || null,
    };
    const allowSelfSignedRaw = read('allow_self_signed', 'self_signed', 'ignore_tls');

    return {
      roomName: read('room_name', 'room', 'name', 'display_name'),
      room: read('room_name', 'room', 'name', 'display_name'),
      roomId: read('room_id', 'roomid', 'id'),
      platform: read('platform', 'system_platform', 'room_platform'),
      integrationKey: read('integration_key', 'integration', 'system_type'),
      sourceResource: read('source_resource', 'resource', 'subscription_resource', 'graph_resource'),
      host: read('host', 'ip', 'ip_address', 'hostname', 'device_host'),
      port: parseLooseNumber(read('port', 'device_port')),
      mac: read('mac', 'mac_address'),
      protocol: read('protocol', 'scheme'),
      allowSelfSigned: allowSelfSignedRaw === null ? null : parseLooseBoolean(allowSelfSignedRaw),
      statusPath: read('status_path', 'health_path', 'diagnostics_path'),
      auth: hasAuth ? auth : null,
      restartRequest: restartRequest.path ? restartRequest : null,
      snmp: snmp.oid ? snmp : null,
      extraHttpPaths: Array.isArray(diagnosticsPayload) ? diagnosticsPayload : [],
      input: read('input', 'default_input'),
      volume: parseLooseNumber(read('volume', 'default_volume')),
      raw: source,
    };
  }

  _pickDefinedRoomFields(room = {}) {
    return Object.fromEntries(
      Object.entries(room).filter(([key, value]) => {
        if (key === 'raw') return false;
        if (value === null || value === undefined) return false;
        if (typeof value === 'string') return value.trim() !== '';
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'object') return Object.keys(value).length > 0;
        return true;
      })
    );
  }

  _buildWebhookRegistrationHint(providerKey, options = {}) {
    const callbackUrl = options.notificationUrlPlaceholder;
    const verificationSecret = options.verificationSecretPlaceholder;
    const sourceResource = options.sourceResource || options.room?.sourceResource || null;
    const defaultEvents = Array.isArray(options.events) && options.events.length > 0
      ? options.events
      : ['room.error', 'room.offline', 'room.device_disconnected'];

    if (providerKey === 'microsoft_graph' || providerKey === 'graph' || providerKey === 'graphapi') {
      return {
        provider: 'microsoft_graph',
        registrationMode: 'api_subscription',
        endpoint: 'POST https://graph.microsoft.com/v1.0/subscriptions',
        body: {
          changeType: 'updated',
          notificationUrl: callbackUrl,
          resource: sourceResource || '/communications/callRecords',
          expirationDateTime: '2026-04-02T12:00:00Z',
          clientState: verificationSecret,
        },
        notes: [
          'Use a resource scoped to the room system or meeting resource you monitor.',
          'Graph will call the notification URL and expects the clientState secret back on event delivery.',
          'Subscription renewal must happen before expiration.',
        ],
      };
    }

    if (providerKey === 'zoom' || providerKey === 'zoom_webhook') {
      return {
        provider: 'zoom',
        registrationMode: 'marketplace_webhook',
        endpoint: 'Zoom App Marketplace > Features > Event Subscriptions',
        body: {
          endpoint_url: callbackUrl,
          secret_token: verificationSecret,
          event_types: defaultEvents,
        },
        notes: [
          'Configure the callback URL and secret token in the Zoom app event subscription settings.',
          'Map Zoom room alert events to the room inventory sourceResource when available.',
        ],
      };
    }

    if (providerKey === 'google' || providerKey === 'google_workspace') {
      return {
        provider: 'google',
        registrationMode: 'watch_channel',
        endpoint: `POST ${(sourceResource || 'https://www.googleapis.com/calendar/v3/calendars/primary/events')}:watch`,
        body: {
          id: slugify(options.room?.roomName || options.room?.room || 'vutler-room-watch'),
          type: 'web_hook',
          address: callbackUrl,
          token: verificationSecret,
        },
        notes: [
          'Choose the correct Google resource to watch, for example a calendar or another supported channel.',
          'Use the returned channel/resource identifiers for renewals and cleanup.',
        ],
      };
    }

    return {
      provider: 'generic_http',
      registrationMode: 'manual_webhook',
      callbackUrl,
      headers: {
        'X-Vutler-Webhook-Secret': verificationSecret,
      },
      expectedEvents: defaultEvents,
      notes: [
        'Send JSON payloads to the callback URL.',
        'Include the webhook secret as a header or `?secret=` query parameter.',
      ],
    };
  }

  async _renderWithFallback({ kind, title, instructions, context, fallback }) {
    const llm = this.providers.llm;
    if (!llm) return fallback;

    try {
      const response = await llm.chat([
        {
          role: 'system',
          content: [
            `You are a bounded enterprise document generator for ${kind}.`,
            'Return only the requested content, in clear professional Markdown.',
            'Do not invent facts. If information is missing, state assumptions explicitly.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            title,
            instructions,
            workspaceKnowledge: context.knowledge,
            selectedDocuments: context.documents.map((doc) => ({
              name: doc.name,
              path: doc.path,
              content: doc.content,
            })),
            summary: context.summary,
          }),
        },
      ], {});

      const text = compactText(extractLlmText(response), 20000);
      return text || fallback;
    } catch (_) {
      return fallback;
    }
  }

  async _maybeSendEmail(payload) {
    if (!payload.send || !payload.to || payload.to.length === 0) {
      return { sent: false, skipped: true, reason: 'Delivery not requested or no recipients provided' };
    }

    const email = this.providers.workspaceEmail;
    if (!email) {
      return { sent: false, skipped: true, reason: 'Workspace email provider unavailable' };
    }

    const response = await email.sendEmail(payload);
    return { sent: true, response };
  }

  _documentMeta(doc) {
    return {
      id: doc.id,
      name: doc.name,
      path: doc.path,
      mimeType: doc.mimeType,
    };
  }

  _fallbackSummarizeContext(title, context) {
    const documentList = context.documents.map((doc) => `- ${doc.name} (${doc.path})`).join('\n') || '- No documents selected';
    const snippets = context.documents
      .map((doc) => buildMarkdownSection(doc.name, doc.content))
      .filter(Boolean)
      .join('\n\n');

    return [
      `# ${title}`,
      '',
      buildMarkdownSection('Workspace Knowledge', context.knowledge || 'No workspace knowledge matched.'),
      buildMarkdownSection('Selected Documents', documentList),
      snippets ? buildMarkdownSection('Source Highlights', snippets) : '',
    ].filter(Boolean).join('\n\n');
  }

  _fallbackBidOutline(args, context) {
    const bullets = context.documents.map((doc) => `- ${doc.name}: ${compactText(doc.content, 400).replace(/\n+/g, ' ')}`).join('\n') || '- No source documents selected';
    return [
      `# ${args.title || 'Bid Response Outline'}`,
      '',
      '## Executive Summary',
      '',
      compactText(args.summary || 'Proposed response outline generated from workspace sources.', 1200),
      '',
      '## Source Materials',
      '',
      bullets,
      '',
      '## Recommended Sections',
      '',
      '- Client context',
      '- Scope and objectives',
      '- Delivery approach',
      '- Assumptions and exclusions',
      '- Risks and mitigations',
      '- Commercial next steps',
      '',
      buildMarkdownSection('Workspace Knowledge', context.knowledge || 'No workspace knowledge matched.'),
    ].filter(Boolean).join('\n');
  }

  _fallbackReport(args, context) {
    const docSections = context.documents
      .map((doc) => buildMarkdownSection(doc.name, doc.content))
      .filter(Boolean)
      .join('\n\n');

    return [
      `# ${args.title || 'Operational Report'}`,
      '',
      '## Executive Summary',
      '',
      compactText(args.summary || context.summary || 'Report generated from workspace context and selected source documents.', 1600),
      '',
      buildMarkdownSection('Workspace Knowledge', context.knowledge || 'No workspace knowledge matched.'),
      docSections,
      '',
      '## Next Steps',
      '',
      '- Validate assumptions with the client',
      '- Confirm owners and deadlines',
      '- Share report with stakeholders',
    ].filter(Boolean).join('\n\n');
  }

  _fallbackDeliveryEmail({ subject, recipientName, summary }) {
    return [
      `Subject: ${subject}`,
      '',
      `Hello ${recipientName},`,
      '',
      summary || 'Please find the requested report attached or copied below.',
      '',
      'Let me know if you would like any edits or an expanded version.',
      '',
      'Best regards,',
      'Vutler',
    ].join('\n');
  }

  _success(tools, data) {
    return {
      status: 'completed',
      data,
      metadata: {
        toolsUsed: String(tools).split(',').map((item) => item.trim()).filter(Boolean),
      },
    };
  }

  _failure(tools, error, data) {
    return {
      status: 'failed',
      data,
      error,
      metadata: {
        toolsUsed: String(tools).split(',').map((item) => item.trim()).filter(Boolean),
      },
    };
  }

  _buildAvOptions(args = {}, room = {}) {
    const merged = {
      ...this._pickDefinedRoomFields(room),
      ...this._pickDefinedRoomFields(args),
    };

    return {
      platform: merged.platform || merged.roomPlatform || merged.integrationKey || merged.integration_key,
      integrationKey: merged.integrationKey || merged.integration_key,
      roomName: merged.roomName || merged.room || null,
      room: merged.room || merged.roomName || null,
      roomId: merged.roomId || merged.room_id || null,
      sourceResource: merged.sourceResource || merged.source_resource || null,
      host: merged.host,
      port: merged.port,
      mac: merged.mac,
      protocol: merged.protocol,
      allowSelfSigned: parseLooseBoolean(merged.allowSelfSigned || merged.allow_self_signed),
      auth: normalizeObject(merged.auth),
      headers: normalizeObject(merged.headers),
      statusPath: merged.statusPath || merged.status_path,
      restartRequest: merged.restartRequest || merged.restart_request || null,
      snmp: merged.snmp || null,
      extraHttpPaths: merged.extraHttpPaths || merged.extra_http_paths || [],
      input: merged.input,
      volume: merged.volume,
    };
  }

  _buildAvDiagnosticSummary(diagnostics = {}) {
    const checks = Array.isArray(diagnostics.checks) ? diagnostics.checks.length : 0;
    const pingStatus = diagnostics.ping?.alive ? `reachable (${diagnostics.ping.ms ?? '?'} ms)` : 'unreachable';
    return [
      `Room ${diagnostics.room || diagnostics.host || 'unknown'} on ${diagnostics.platform || 'generic'} is ${diagnostics.healthy ? 'healthy' : 'degraded'}.`,
      `Ping status: ${pingStatus}.`,
      `Collected ${checks} diagnostic checks.`,
    ].join(' ');
  }

  _buildAvDailyReportSummary(args = {}) {
    const rooms = normalizeArray(args.rooms).map((room) => {
      if (typeof room === 'string') return room;
      const name = room?.name || room?.roomName || room?.room || 'Unknown room';
      const status = room?.status || room?.health || room?.state || 'unknown';
      return `${name}: ${status}`;
    });

    if (rooms.length === 0) {
      return 'Daily AV report generated. No room list was provided.';
    }

    return [
      'Daily AV report summary:',
      ...rooms.slice(0, 20).map((item) => `- ${item}`),
    ].join('\n');
  }

  _progress(onProgress, stage, message) {
    if (!onProgress) return;
    onProgress({ stage, message });
  }
}

module.exports = { EnterpriseActionExecutor };
