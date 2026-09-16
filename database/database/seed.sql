BEGIN;

DO $$
DECLARE
  v_tenant_id uuid;
  v_admin_user_id uuid;
  v_entity_id uuid;
  v_membership_id uuid;
  v_sap_channel_id uuid;
  v_role_id uuid;
  v_finance_controller_role_id uuid;
  v_ar_manager_role_id uuid;
  v_metro_entity_id uuid;
  v_orbit_entity_id uuid;
  v_model_06b_id uuid;
  v_model_17b_id uuid;
  v_model_4b_id uuid;
  v_model_8b_id uuid;
  v_model_14b_id uuid;
  v_model_32b_id uuid;
  v_prompt_template_id uuid;
  v_prompt_v431_id uuid;
  v_prompt_v432_id uuid;
  v_prompt_v440_id uuid;
  v_assignment_id uuid;
  v_classification_model_v1_id uuid;
  v_classification_model_v2_id uuid;
  v_classification_model_finetuned_id uuid;
  v_classification_mapping_id uuid;
BEGIN
  INSERT INTO tenants (tenant_key, name, status)
  VALUES ('northline-retail', 'Northline Retail', 'active')
  ON CONFLICT (tenant_key) DO UPDATE
    SET name = EXCLUDED.name,
        status = EXCLUDED.status,
        updated_at = now()
  RETURNING id INTO v_tenant_id;

  INSERT INTO app_users (email, display_name, password_hash, status)
  VALUES (
    'admin@northline.com',
    'Northline Entity Admin',
    'scrypt$1fddc22439fe00622b7930da45b994ba$7f5a7fe90efeb0b09cb2be8e64ea108f3e6b5f3fab69104b54852678e7b58bf7ee71aee0949354ff42543f8efde086daee4cf0aebf26c614d3474082267e5cf1',
    'active'
  )
  ON CONFLICT (lower(email)) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        password_hash = EXCLUDED.password_hash,
        status = EXCLUDED.status,
        updated_at = now()
  RETURNING id INTO v_admin_user_id;

  INSERT INTO tenant_memberships (tenant_id, user_id, status, joined_at)
  VALUES (v_tenant_id, v_admin_user_id, 'active', now())
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET status = EXCLUDED.status,
        joined_at = COALESCE(tenant_memberships.joined_at, EXCLUDED.joined_at);

  INSERT INTO model_catalog (model_key, display_name, provider, description)
  VALUES
    ('qwen3-0.6b', 'Qwen3-0.6B', 'Qwen', 'Fast baseline checks'),
    ('qwen3-1.7b', 'Qwen3-1.7B', 'Qwen', 'Low-cost production draft'),
    ('qwen3-4b', 'Qwen3-4B', 'Qwen', 'Balanced quality and speed'),
    ('qwen3-8b', 'Qwen3-8B', 'Qwen', 'Default enterprise extraction'),
    ('qwen3-14b', 'Qwen3-14B', 'Qwen', 'Complex invoice reasoning'),
    ('qwen3-32b', 'Qwen3-32B', 'Qwen', 'Premium high-quality gate')
  ON CONFLICT (model_key) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        provider = EXCLUDED.provider,
        description = EXCLUDED.description,
        is_active = true;

  SELECT id INTO v_model_06b_id FROM model_catalog WHERE model_key = 'qwen3-0.6b';
  SELECT id INTO v_model_17b_id FROM model_catalog WHERE model_key = 'qwen3-1.7b';
  SELECT id INTO v_model_4b_id FROM model_catalog WHERE model_key = 'qwen3-4b';
  SELECT id INTO v_model_8b_id FROM model_catalog WHERE model_key = 'qwen3-8b';
  SELECT id INTO v_model_14b_id FROM model_catalog WHERE model_key = 'qwen3-14b';
  SELECT id INTO v_model_32b_id FROM model_catalog WHERE model_key = 'qwen3-32b';

  INSERT INTO classification_model_catalog (
    model_key,
    display_name,
    provider,
    model_version,
    description
  )
  VALUES
    ('doc-classifier-v1', 'doc-classifier-v1', 'Lexa AI', '1.0', 'Baseline document classification model'),
    ('doc-classifier-v2', 'doc-classifier-v2', 'Lexa AI', '2.0', 'Default enterprise document classification model'),
    ('doc-classifier-v2-finetuned', 'doc-classifier-v2-finetuned', 'Lexa AI', '2.0-ft', 'Fine-tuned entity classification model')
  ON CONFLICT (model_key) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        provider = EXCLUDED.provider,
        model_version = EXCLUDED.model_version,
        description = EXCLUDED.description,
        is_active = true;

  SELECT id INTO v_classification_model_v1_id
    FROM classification_model_catalog
   WHERE model_key = 'doc-classifier-v1';
  SELECT id INTO v_classification_model_v2_id
    FROM classification_model_catalog
   WHERE model_key = 'doc-classifier-v2';
  SELECT id INTO v_classification_model_finetuned_id
    FROM classification_model_catalog
   WHERE model_key = 'doc-classifier-v2-finetuned';

  INSERT INTO entities (
    tenant_id,
    entity_key,
    name,
    industry_code,
    region_code,
    status,
    created_by_user_id
  )
  VALUES (
    v_tenant_id,
    'CL-10017',
    'Northline Retail',
    'retail',
    'apac',
    'active',
    v_admin_user_id
  )
  ON CONFLICT (tenant_id, entity_key) DO UPDATE
    SET name = EXCLUDED.name,
        industry_code = EXCLUDED.industry_code,
        region_code = EXCLUDED.region_code,
        status = EXCLUDED.status,
        updated_at = now()
  RETURNING id INTO v_entity_id;

  INSERT INTO entity_settings (
    entity_id,
    tenant_id,
    primary_admin_email,
    primary_admin_username,
    primary_admin_user_id,
    onboarding_notes,
    user_creation_enabled,
    rbac_enabled,
    default_role_key,
    accounts_payable_enabled,
    accounts_receivable_enabled
  )
  VALUES (
    v_entity_id,
    v_tenant_id,
    'admin@northline.com',
    'northline.admin',
    v_admin_user_id,
    'Enable all AI governance modules by default after access setup. Team can fine-tune per entity later.',
    true,
    true,
    'entity_admin',
    true,
    true
  )
  ON CONFLICT (entity_id) DO UPDATE
    SET primary_admin_email = EXCLUDED.primary_admin_email,
        primary_admin_username = EXCLUDED.primary_admin_username,
        primary_admin_user_id = EXCLUDED.primary_admin_user_id,
        onboarding_notes = EXCLUDED.onboarding_notes,
        user_creation_enabled = EXCLUDED.user_creation_enabled,
        rbac_enabled = EXCLUDED.rbac_enabled,
        default_role_key = EXCLUDED.default_role_key,
        accounts_payable_enabled = EXCLUDED.accounts_payable_enabled,
        accounts_receivable_enabled = EXCLUDED.accounts_receivable_enabled,
        updated_at = now();

  INSERT INTO entities (
    tenant_id,
    entity_key,
    name,
    industry_code,
    region_code,
    status,
    created_by_user_id
  )
  VALUES
    (v_tenant_id, 'MH-10001', 'Metro Health', 'healthcare', 'apac', 'active', v_admin_user_id),
    (v_tenant_id, 'OF-10001', 'Orbit Foods', 'retail', 'apac', 'active', v_admin_user_id)
  ON CONFLICT (tenant_id, entity_key) DO UPDATE
    SET name = EXCLUDED.name,
        industry_code = EXCLUDED.industry_code,
        region_code = EXCLUDED.region_code,
        status = EXCLUDED.status,
        updated_at = now();

  SELECT id INTO v_metro_entity_id
    FROM entities
   WHERE tenant_id = v_tenant_id AND entity_key = 'MH-10001';
  SELECT id INTO v_orbit_entity_id
    FROM entities
   WHERE tenant_id = v_tenant_id AND entity_key = 'OF-10001';

  INSERT INTO entity_settings (
    entity_id,
    tenant_id,
    primary_admin_email,
    primary_admin_username,
    onboarding_notes,
    user_creation_enabled,
    rbac_enabled,
    default_role_key,
    accounts_payable_enabled,
    accounts_receivable_enabled
  )
  VALUES
    (v_metro_entity_id, v_tenant_id, 'admin@metrohealth.example', 'metro.health.admin', 'Seeded assignment example.', true, true, 'entity_admin', true, true),
    (v_orbit_entity_id, v_tenant_id, 'admin@orbitfoods.example', 'orbit.foods.admin', 'Seeded assignment example.', true, true, 'entity_admin', true, true)
  ON CONFLICT (entity_id) DO UPDATE
    SET primary_admin_email = EXCLUDED.primary_admin_email,
        primary_admin_username = EXCLUDED.primary_admin_username,
        onboarding_notes = EXCLUDED.onboarding_notes,
        user_creation_enabled = EXCLUDED.user_creation_enabled,
        rbac_enabled = EXCLUDED.rbac_enabled,
        default_role_key = EXCLUDED.default_role_key,
        accounts_payable_enabled = EXCLUDED.accounts_payable_enabled,
        accounts_receivable_enabled = EXCLUDED.accounts_receivable_enabled,
        updated_at = now();

  INSERT INTO entity_memberships (
    tenant_id,
    entity_id,
    user_id,
    status,
    is_primary_admin
  )
  VALUES (v_tenant_id, v_entity_id, v_admin_user_id, 'active', true)
  ON CONFLICT (entity_id, user_id) DO UPDATE
    SET status = EXCLUDED.status,
        is_primary_admin = EXCLUDED.is_primary_admin
  RETURNING id INTO v_membership_id;

  INSERT INTO entity_intake_channels (
    tenant_id,
    entity_id,
    channel_key,
    is_enabled,
    connection_settings,
    connection_status
  )
  VALUES (
    v_tenant_id,
    v_entity_id,
    'sap',
    true,
    jsonb_build_object(
      'endpoint', '',
      'client_id', '',
      'document_types', jsonb_build_array('invoices', 'po', 'grn')
    ),
    'not_configured'
  )
  ON CONFLICT (entity_id, channel_key) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        connection_settings = EXCLUDED.connection_settings,
        connection_status = EXCLUDED.connection_status,
        updated_at = now()
  RETURNING id INTO v_sap_channel_id;

  INSERT INTO entity_intake_channels (
    tenant_id,
    entity_id,
    channel_key,
    is_enabled,
    connection_settings,
    connection_status
  )
  VALUES
    (
      v_tenant_id,
      v_entity_id,
      'upload',
      false,
      jsonb_build_object(
        'max_file_size', '10mb',
        'accepted_formats', jsonb_build_array('pdf', 'xml', 'jpg', 'png')
      ),
      'disabled'
    ),
    (
      v_tenant_id,
      v_entity_id,
      'vendor',
      false,
      jsonb_build_object(
        'portal_url', '',
        'auto_approve', false
      ),
      'disabled'
    ),
    (
      v_tenant_id,
      v_entity_id,
      'mail',
      false,
      jsonb_build_object(
        'provider', 'gmail',
        'mailbox', '',
        'username', '',
        'folder', 'inbox',
        'sync_frequency', 'every_5_minutes',
        'connection_status', 'Not connected'
      ),
      'disabled'
    )
  ON CONFLICT (entity_id, channel_key) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        connection_settings = EXCLUDED.connection_settings,
        connection_status = EXCLUDED.connection_status,
        updated_at = now();

  INSERT INTO entity_channel_document_types (tenant_id, intake_channel_id, document_type_key)
  SELECT v_tenant_id, v_sap_channel_id, value
    FROM jsonb_array_elements_text(jsonb_build_array('invoices', 'po', 'grn')) AS document_types(value)
  ON CONFLICT DO NOTHING;

  INSERT INTO entity_matching_policies (
    entity_id,
    tenant_id,
    matching_method,
    purchase_order_source_key,
    grn_source_key,
    inspection_source_key,
    eway_bill_policy,
    eway_bill_threshold
  )
  VALUES (
    v_entity_id,
    v_tenant_id,
    'three_way',
    'sap',
    'sap',
    'not_applicable',
    'required_above_threshold',
    50000
  )
  ON CONFLICT (entity_id) DO UPDATE
    SET matching_method = EXCLUDED.matching_method,
        purchase_order_source_key = EXCLUDED.purchase_order_source_key,
        grn_source_key = EXCLUDED.grn_source_key,
        inspection_source_key = EXCLUDED.inspection_source_key,
        eway_bill_policy = EXCLUDED.eway_bill_policy,
        eway_bill_threshold = EXCLUDED.eway_bill_threshold,
        updated_at = now();

  INSERT INTO entity_modules (tenant_id, entity_id, module_key, is_enabled, settings)
  VALUES
    (v_tenant_id, v_entity_id, 'ap_ar_scope', true, jsonb_build_object('accounts_payable', true, 'accounts_receivable', true)),
    (v_tenant_id, v_entity_id, 'user_access', true, jsonb_build_object('user_creation', true, 'rbac', true)),
    (v_tenant_id, v_entity_id, 'models', true, jsonb_build_object('model_assignment', true, 'prompt_versioning', true)),
    (v_tenant_id, v_entity_id, 'classification', true, jsonb_build_object('classification', true, 'class_override', true)),
    (v_tenant_id, v_entity_id, 'provider_governance', true, jsonb_build_object('provider_governance', true, 'fallback_routing', true)),
    (v_tenant_id, v_entity_id, 'api_integrations', false, jsonb_build_object(
      'gst_tax', true,
      'identity_kyc', true,
      'banking', true,
      'business_compliance', false
    ))
  ON CONFLICT (entity_id, module_key) DO UPDATE
    SET is_enabled = EXCLUDED.is_enabled,
        settings = EXCLUDED.settings,
        updated_at = now();

  INSERT INTO classification_mappings (
    tenant_id,
    entity_id,
    mapping_key,
    version_no,
    classification_model_id,
    document_type_key,
    confidence_threshold_pct,
    fallback_class_key,
    lifecycle_status,
    created_by_user_id,
    published_by_user_id,
    published_at
  )
  VALUES (
    v_tenant_id,
    v_entity_id,
    'northline-invoice-document-mapping',
    1,
    v_classification_model_v2_id,
    'invoices',
    90,
    'manual_review',
    'published',
    v_admin_user_id,
    v_admin_user_id,
    now()
  )
  ON CONFLICT (entity_id, mapping_key, version_no) DO UPDATE
    SET classification_model_id = EXCLUDED.classification_model_id,
        document_type_key = EXCLUDED.document_type_key,
        confidence_threshold_pct = EXCLUDED.confidence_threshold_pct,
        fallback_class_key = EXCLUDED.fallback_class_key,
        lifecycle_status = EXCLUDED.lifecycle_status,
        published_by_user_id = EXCLUDED.published_by_user_id,
        published_at = EXCLUDED.published_at,
        updated_at = now()
  RETURNING id INTO v_classification_mapping_id;

  DELETE FROM classification_mapping_classes
   WHERE mapping_id = v_classification_mapping_id;

  INSERT INTO classification_mapping_classes (
    tenant_id,
    mapping_id,
    class_key,
    priority,
    min_confidence_pct,
    routing_key,
    status,
    is_fallback
  )
  VALUES
    (v_tenant_id, v_classification_mapping_id, 'invoice', 1, 92, 'extraction_workflow', 'active', false),
    (v_tenant_id, v_classification_mapping_id, 'remittance', 2, 90, 'cash_application', 'active', false),
    (v_tenant_id, v_classification_mapping_id, 'proof_of_delivery', 3, 88, 'pod_validation', 'pilot', false),
    (v_tenant_id, v_classification_mapping_id, 'debit_note', 4, 90, 'extraction_workflow', 'active', false),
    (v_tenant_id, v_classification_mapping_id, 'credit_note', 5, 90, 'extraction_workflow', 'active', false),
    (v_tenant_id, v_classification_mapping_id, 'purchase_order', 6, 90, 'extraction_workflow', 'active', false),
    (v_tenant_id, v_classification_mapping_id, 'bank_statement', 7, 90, 'cash_application', 'active', false),
    (v_tenant_id, v_classification_mapping_id, 'unknown', 99, 0, 'manual_review_queue', 'fallback', true);

  DELETE FROM classification_test_runs
   WHERE mapping_id = v_classification_mapping_id;

  INSERT INTO classification_test_runs (
    tenant_id,
    mapping_id,
    sample_text,
    sample_metadata,
    predicted_class_key,
    confidence_pct,
    used_fallback,
    result_status,
    result_message,
    executed_by_user_id
  )
  VALUES (
    v_tenant_id,
    v_classification_mapping_id,
    'Remittance advice for invoice INV-88213 with payment reference and settlement amount.',
    jsonb_build_object(
      'entity_id', 'CL-10017',
      'document_source', 'sap',
      'document_type', 'invoices'
    ),
    'remittance',
    93,
    false,
    'classified',
    'Predicted class remittance with simulated confidence 0.93 above threshold.',
    v_admin_user_id
  );

  DELETE FROM classification_mapping_events
   WHERE mapping_id = v_classification_mapping_id;

  INSERT INTO classification_mapping_events (
    tenant_id,
    mapping_id,
    event_type,
    actor_user_id,
    metadata
  )
  VALUES
    (v_tenant_id, v_classification_mapping_id, 'created', v_admin_user_id, jsonb_build_object('source', 'database/seed.sql')),
    (v_tenant_id, v_classification_mapping_id, 'tested', v_admin_user_id, jsonb_build_object('predicted_class', 'remittance', 'confidence_pct', 93)),
    (v_tenant_id, v_classification_mapping_id, 'published', v_admin_user_id, jsonb_build_object('model_key', 'doc-classifier-v2', 'threshold_pct', 90));

  PERFORM refresh_entity_role_engine(v_entity_id);

  SELECT id INTO v_role_id
    FROM roles
   WHERE tenant_id = v_tenant_id
     AND role_key = 'entity_admin';

  INSERT INTO entity_membership_roles (
    tenant_id,
    entity_membership_id,
    role_id,
    assigned_by_user_id
  )
  VALUES (v_tenant_id, v_membership_id, v_role_id, v_admin_user_id)
  ON CONFLICT (entity_membership_id, role_id) DO NOTHING;

  SELECT id INTO v_finance_controller_role_id
    FROM roles
   WHERE tenant_id = v_tenant_id
     AND role_key = 'finance_controller';
  SELECT id INTO v_ar_manager_role_id
    FROM roles
   WHERE tenant_id = v_tenant_id
     AND role_key = 'ar_manager';

  INSERT INTO prompt_templates (
    tenant_id,
    prompt_key,
    name,
    domain,
    owner_name,
    output_schema_version,
    baseline_prompt,
    scope
  )
  VALUES (
    v_tenant_id,
    'PRM-INV-00432',
    'Invoice Extraction Assistant',
    'AR operations',
    'AI Ops',
    '2.1',
    'system: You are an invoice extraction assistant for AR operations.
rules:
- Extract only fields visible in document evidence.
- Return JSON schema v2.1 exactly.
- Mark uncertain fields with confidence < 0.90.
- Never invent values not present in OCR text.

output_schema: invoice_number, invoice_date, vendor_name, gstin, total_amount',
    'tenant'
  )
  ON CONFLICT (tenant_id, prompt_key) DO UPDATE
    SET name = EXCLUDED.name,
        domain = EXCLUDED.domain,
        owner_name = EXCLUDED.owner_name,
        output_schema_version = EXCLUDED.output_schema_version,
        baseline_prompt = EXCLUDED.baseline_prompt,
        updated_at = now()
  RETURNING id INTO v_prompt_template_id;

  INSERT INTO prompt_versions (
    tenant_id,
    template_id,
    model_id,
    version_tag,
    prompt_text,
    dataset_key,
    change_summary,
    lifecycle_status,
    created_by_user_id,
    approved_by_user_id,
    approved_at
  )
  VALUES (
    v_tenant_id,
    v_prompt_template_id,
    v_model_8b_id,
    'v4.3.1',
    'system: You are an invoice extraction assistant for AR operations.
rules:
- Extract only fields visible in document evidence.
- Return JSON schema v2.1 exactly.
- Mark uncertain fields with confidence < 0.90.
- Never invent values not present in OCR text.

output_schema: invoice_number, invoice_date, vendor_name, gstin, total_amount',
    'AR_Golden_2K',
    'Previous approved production version.',
    'approved',
    v_admin_user_id,
    v_admin_user_id,
    now()
  )
  ON CONFLICT (template_id, version_tag) DO UPDATE
    SET model_id = EXCLUDED.model_id,
        prompt_text = EXCLUDED.prompt_text,
        dataset_key = EXCLUDED.dataset_key,
        change_summary = EXCLUDED.change_summary,
        lifecycle_status = EXCLUDED.lifecycle_status,
        approved_by_user_id = EXCLUDED.approved_by_user_id,
        approved_at = EXCLUDED.approved_at,
        updated_at = now()
  RETURNING id INTO v_prompt_v431_id;

  INSERT INTO prompt_versions (
    tenant_id,
    template_id,
    model_id,
    version_tag,
    prompt_text,
    dataset_key,
    change_summary,
    lifecycle_status,
    created_by_user_id,
    approved_by_user_id,
    approved_at
  )
  VALUES (
    v_tenant_id,
    v_prompt_template_id,
    v_model_8b_id,
    'v4.3.2',
    'system: You are an invoice extraction assistant for AR operations.
rules:
- Extract only fields visible in document evidence.
- Return JSON schema v2.1 exactly.
- Mark uncertain fields with confidence < 0.90.
- Never invent values not present in OCR text.

output_schema: invoice_number, invoice_date, vendor_name, gstin, total_amount',
    'AR_Golden_2K',
    'Improved GST and vendor alias extraction.',
    'approved',
    v_admin_user_id,
    v_admin_user_id,
    now()
  )
  ON CONFLICT (template_id, version_tag) DO UPDATE
    SET model_id = EXCLUDED.model_id,
        prompt_text = EXCLUDED.prompt_text,
        dataset_key = EXCLUDED.dataset_key,
        change_summary = EXCLUDED.change_summary,
        lifecycle_status = EXCLUDED.lifecycle_status,
        approved_by_user_id = EXCLUDED.approved_by_user_id,
        approved_at = EXCLUDED.approved_at,
        updated_at = now()
  RETURNING id INTO v_prompt_v432_id;

  INSERT INTO prompt_versions (
    tenant_id,
    template_id,
    model_id,
    version_tag,
    prompt_text,
    dataset_key,
    change_summary,
    lifecycle_status,
    created_by_user_id
  )
  VALUES (
    v_tenant_id,
    v_prompt_template_id,
    v_model_14b_id,
    'v4.4.0-rc1',
    'system: You are an invoice extraction assistant for AR operations.
rules:
- Extract only fields visible in document evidence.
- Return JSON schema v2.1 exactly.
- Mark uncertain fields with confidence < 0.90.
- Never invent values not present in OCR text.

output_schema: invoice_number, invoice_date, vendor_name, gstin, total_amount',
    'AR_Edge_500',
    'Candidate for complex invoice reasoning.',
    'candidate',
    v_admin_user_id
  )
  ON CONFLICT (template_id, version_tag) DO UPDATE
    SET model_id = EXCLUDED.model_id,
        prompt_text = EXCLUDED.prompt_text,
        dataset_key = EXCLUDED.dataset_key,
        change_summary = EXCLUDED.change_summary,
        lifecycle_status = EXCLUDED.lifecycle_status,
        updated_at = now()
  RETURNING id INTO v_prompt_v440_id;

  INSERT INTO prompt_quality_evaluations (
    tenant_id,
    prompt_version_id,
    dataset_key,
    precision_pct,
    recall_pct,
    f1_pct,
    hallucination_pct,
    latency_seconds,
    gate_result,
    eval_report_ref,
    evaluated_by_user_id
  )
  VALUES
    (v_tenant_id, v_prompt_v432_id, 'AR_Golden_2K', 95.2, 94.1, 94.6, 0.8, 1.3, 'approved', 'eval/ar-golden-2k/v4.3.2', v_admin_user_id),
    (v_tenant_id, v_prompt_v431_id, 'AR_Golden_2K', 94.0, 92.8, 93.4, 1.2, 1.2, 'approved', 'eval/ar-golden-2k/v4.3.1', v_admin_user_id),
    (v_tenant_id, v_prompt_v440_id, 'AR_Edge_500', 93.3, 90.6, 91.9, 2.4, 1.6, 'needs_fix', 'eval/ar-edge-500/v4.4.0-rc1', v_admin_user_id)
  ON CONFLICT (prompt_version_id, dataset_key) DO UPDATE
    SET precision_pct = EXCLUDED.precision_pct,
        recall_pct = EXCLUDED.recall_pct,
        f1_pct = EXCLUDED.f1_pct,
        hallucination_pct = EXCLUDED.hallucination_pct,
        latency_seconds = EXCLUDED.latency_seconds,
        gate_result = EXCLUDED.gate_result,
        eval_report_ref = EXCLUDED.eval_report_ref,
        evaluated_by_user_id = EXCLUDED.evaluated_by_user_id,
        evaluated_at = now();

  DELETE FROM model_assignment_events
   WHERE tenant_id = v_tenant_id
     AND assignment_id IN (
       SELECT id
         FROM model_assignments
        WHERE tenant_id = v_tenant_id
          AND assignment_key IN (
            'northline-pending-v432',
            'northline-canary-v432',
            'metro-full-v432',
            'orbit-pilot-v440'
          )
     );

  INSERT INTO model_assignments (
    tenant_id,
    assignment_key,
    entity_id,
    model_id,
    current_prompt_version_id,
    target_prompt_version_id,
    rollout_strategy,
    rollout_percent,
    owner_role_id,
    owner_approval_status,
    assignment_status,
    assigned_by_user_id
  )
  VALUES (
    v_tenant_id,
    'northline-pending-v432',
    v_entity_id,
    v_model_8b_id,
    v_prompt_v432_id,
    NULL,
    'canary',
    0,
    NULL,
    'pending',
    'pending_assignment',
    v_admin_user_id
  )
  ON CONFLICT (tenant_id, assignment_key) DO UPDATE
    SET entity_id = EXCLUDED.entity_id,
        model_id = EXCLUDED.model_id,
        current_prompt_version_id = EXCLUDED.current_prompt_version_id,
        target_prompt_version_id = EXCLUDED.target_prompt_version_id,
        rollout_strategy = EXCLUDED.rollout_strategy,
        rollout_percent = EXCLUDED.rollout_percent,
        owner_role_id = EXCLUDED.owner_role_id,
        owner_approval_status = EXCLUDED.owner_approval_status,
        assignment_status = EXCLUDED.assignment_status,
        updated_at = now()
  RETURNING id INTO v_assignment_id;

  INSERT INTO model_assignment_events (tenant_id, assignment_id, event_type, to_status, actor_user_id, metadata)
  VALUES (v_tenant_id, v_assignment_id, 'created', 'pending_assignment', v_admin_user_id, jsonb_build_object('source', 'database/seed.sql'));

  INSERT INTO model_assignments (
    tenant_id,
    assignment_key,
    entity_id,
    model_id,
    current_prompt_version_id,
    target_prompt_version_id,
    rollout_strategy,
    rollout_percent,
    owner_role_id,
    owner_approval_status,
    assignment_status,
    assigned_by_user_id
  )
  VALUES (
    v_tenant_id,
    'northline-canary-v432',
    v_entity_id,
    v_model_8b_id,
    v_prompt_v431_id,
    v_prompt_v432_id,
    'canary',
    10,
    v_finance_controller_role_id,
    'approved',
    'deploying',
    v_admin_user_id
  )
  ON CONFLICT (tenant_id, assignment_key) DO UPDATE
    SET entity_id = EXCLUDED.entity_id,
        model_id = EXCLUDED.model_id,
        current_prompt_version_id = EXCLUDED.current_prompt_version_id,
        target_prompt_version_id = EXCLUDED.target_prompt_version_id,
        rollout_strategy = EXCLUDED.rollout_strategy,
        rollout_percent = EXCLUDED.rollout_percent,
        owner_role_id = EXCLUDED.owner_role_id,
        owner_approval_status = EXCLUDED.owner_approval_status,
        assignment_status = EXCLUDED.assignment_status,
        updated_at = now()
  RETURNING id INTO v_assignment_id;

  INSERT INTO model_assignment_events (tenant_id, assignment_id, event_type, to_status, actor_user_id, metadata)
  VALUES
    (v_tenant_id, v_assignment_id, 'created', 'planned', v_admin_user_id, jsonb_build_object('rollout', '10% Canary')),
    (v_tenant_id, v_assignment_id, 'approved', 'deploying', v_admin_user_id, jsonb_build_object('owner_role', 'finance_controller'));

  INSERT INTO model_assignments (
    tenant_id,
    assignment_key,
    entity_id,
    model_id,
    current_prompt_version_id,
    target_prompt_version_id,
    rollout_strategy,
    rollout_percent,
    owner_role_id,
    owner_approval_status,
    assignment_status,
    assigned_by_user_id,
    activated_at
  )
  VALUES (
    v_tenant_id,
    'metro-full-v432',
    v_metro_entity_id,
    v_model_8b_id,
    v_prompt_v431_id,
    v_prompt_v432_id,
    'full',
    100,
    v_ar_manager_role_id,
    'approved',
    'active',
    v_admin_user_id,
    now()
  )
  ON CONFLICT (tenant_id, assignment_key) DO UPDATE
    SET entity_id = EXCLUDED.entity_id,
        model_id = EXCLUDED.model_id,
        current_prompt_version_id = EXCLUDED.current_prompt_version_id,
        target_prompt_version_id = EXCLUDED.target_prompt_version_id,
        rollout_strategy = EXCLUDED.rollout_strategy,
        rollout_percent = EXCLUDED.rollout_percent,
        owner_role_id = EXCLUDED.owner_role_id,
        owner_approval_status = EXCLUDED.owner_approval_status,
        assignment_status = EXCLUDED.assignment_status,
        activated_at = EXCLUDED.activated_at,
        updated_at = now()
  RETURNING id INTO v_assignment_id;

  INSERT INTO model_assignment_events (tenant_id, assignment_id, event_type, to_status, actor_user_id, metadata)
  VALUES
    (v_tenant_id, v_assignment_id, 'created', 'deploying', v_admin_user_id, jsonb_build_object('rollout', '100%')),
    (v_tenant_id, v_assignment_id, 'activated', 'active', v_admin_user_id, jsonb_build_object('owner_role', 'ar_manager'));

  INSERT INTO model_assignments (
    tenant_id,
    assignment_key,
    entity_id,
    model_id,
    current_prompt_version_id,
    target_prompt_version_id,
    rollout_strategy,
    rollout_percent,
    owner_role_id,
    owner_approval_status,
    assignment_status,
    assigned_by_user_id
  )
  VALUES (
    v_tenant_id,
    'orbit-pilot-v440',
    v_orbit_entity_id,
    v_model_14b_id,
    v_prompt_v431_id,
    v_prompt_v440_id,
    'pilot',
    10,
    NULL,
    'pending',
    'blocked',
    v_admin_user_id
  )
  ON CONFLICT (tenant_id, assignment_key) DO UPDATE
    SET entity_id = EXCLUDED.entity_id,
        model_id = EXCLUDED.model_id,
        current_prompt_version_id = EXCLUDED.current_prompt_version_id,
        target_prompt_version_id = EXCLUDED.target_prompt_version_id,
        rollout_strategy = EXCLUDED.rollout_strategy,
        rollout_percent = EXCLUDED.rollout_percent,
        owner_role_id = EXCLUDED.owner_role_id,
        owner_approval_status = EXCLUDED.owner_approval_status,
        assignment_status = EXCLUDED.assignment_status,
        updated_at = now()
  RETURNING id INTO v_assignment_id;

  INSERT INTO model_assignment_events (tenant_id, assignment_id, event_type, to_status, actor_user_id, metadata)
  VALUES (v_tenant_id, v_assignment_id, 'blocked', 'blocked', v_admin_user_id, jsonb_build_object('reason', 'Quality gate needs fix'));

  DELETE FROM entity_onboarding_runs
   WHERE tenant_id = v_tenant_id
     AND entity_id = v_entity_id
     AND status = 'created';

  INSERT INTO entity_onboarding_runs (
    tenant_id,
    entity_id,
    status,
    current_step,
    submitted_by_user_id,
    payload,
    completed_at
  )
  VALUES (
    v_tenant_id,
    v_entity_id,
    'created',
    7,
    v_admin_user_id,
    jsonb_build_object(
      'entity', jsonb_build_object(
        'entityId', 'CL-10017',
        'entityName', 'Northline Retail',
        'industry', 'retail',
        'region', 'apac',
        'adminEmail', 'admin@northline.com',
        'notes', 'Enable all AI governance modules by default after access setup. Team can fine-tune per entity later.'
      ),
      'intakeModes', jsonb_build_array('sap'),
      'intakeConfig', jsonb_build_object(
        'sap', jsonb_build_object(
          'endpoint', '',
          'clientId', '',
          'docTypes', 'invoices,po,grn'
        )
      ),
      'matchingPolicy', jsonb_build_object(
        'matchingMode', 'three_way',
        'poSource', 'sap',
        'grnSource', 'sap',
        'inspectionSource', 'not_applicable',
        'ewayBillMode', 'required_above_threshold',
        'ewayBillThreshold', 50000
      ),
      'projectScope', jsonb_build_object(
        'accountsPayable', true,
        'accountsReceivable', true
      ),
      'access', jsonb_build_object(
        'userCreation', true,
        'rbac', true,
        'defaultRole', 'entity_admin',
        'credentialsProvisioned', false
      ),
      'modules', jsonb_build_object(
        'modelIntegration', true,
        'promptVersioning', true,
        'documentClassification', true,
        'classOverride', true,
        'providerGovernance', true,
        'fallbackRouting', true
      ),
      'status', 'created'
    ),
    now()
  )
  ON CONFLICT DO NOTHING;

  INSERT INTO audit_events (
    tenant_id,
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  )
  SELECT
    v_tenant_id,
    v_admin_user_id,
    'entity.seeded',
    'entity',
    v_entity_id,
    jsonb_build_object(
      'entity_key', 'CL-10017',
      'source', 'database/seed.sql',
      'status', 'created'
    )
  WHERE NOT EXISTS (
    SELECT 1
      FROM audit_events
     WHERE tenant_id = v_tenant_id
       AND action = 'entity.seeded'
       AND resource_type = 'entity'
       AND resource_id = v_entity_id
       AND metadata->>'source' = 'database/seed.sql'
  );
END;
$$;

COMMIT;

BEGIN;

DO $$
DECLARE
  v_tenant_id uuid;
  v_entity_id uuid;
  v_openai_id uuid;
  v_reducto_id uuid;
  v_api_id uuid;
BEGIN
  SELECT id INTO v_tenant_id
    FROM tenants
   WHERE tenant_key = 'northline-retail';
  SELECT id INTO v_entity_id
    FROM entities
   WHERE tenant_id = v_tenant_id
     AND entity_key = 'CL-10017';

  INSERT INTO secret_references (tenant_id, provider, secret_ref, secret_type, metadata)
  VALUES
    (v_tenant_id, 'OpenAI', 'kv://prod/provider/openai', 'api_key', '{"configured": true}'),
    (v_tenant_id, 'Reducto', 'kv://prod/provider/reducto', 'api_key', '{"configured": true}'),
    (v_tenant_id, 'GSTN / NIC', 'kv://prod/api/gstn', 'api_key', '{"configured": true}'),
    (v_tenant_id, 'NSDL', 'kv://prod/api/nsdl', 'api_key', '{"configured": true}'),
    (v_tenant_id, 'Razorpay', 'kv://prod/api/razorpay', 'api_key', '{"configured": true}')
  ON CONFLICT (tenant_id, secret_ref) DO NOTHING;

  INSERT INTO providers (
    tenant_id,
    provider_key,
    name,
    provider_type,
    base_url,
    vault_ref,
    secret_reference_id,
    status,
    notes
  )
  VALUES
    (
      v_tenant_id,
      'openai',
      'OpenAI',
      'LLM API',
      'https://api.openai.com/v1',
      'kv://prod/provider/openai',
      (SELECT id FROM secret_references WHERE tenant_id = v_tenant_id AND secret_ref = 'kv://prod/provider/openai'),
      'Active',
      'Primary enterprise LLM provider.'
    ),
    (
      v_tenant_id,
      'reducto',
      'Reducto',
      'OCR API',
      'https://api.reducto.ai/v1',
      'kv://prod/provider/reducto',
      (SELECT id FROM secret_references WHERE tenant_id = v_tenant_id AND secret_ref = 'kv://prod/provider/reducto'),
      'Pilot',
      'OCR fallback provider under pilot review.'
    )
  ON CONFLICT (tenant_id, provider_key) DO UPDATE
    SET name = EXCLUDED.name,
        provider_type = EXCLUDED.provider_type,
        base_url = EXCLUDED.base_url,
        vault_ref = EXCLUDED.vault_ref,
        secret_reference_id = EXCLUDED.secret_reference_id,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        updated_at = now();

  SELECT id INTO v_openai_id FROM providers WHERE tenant_id = v_tenant_id AND provider_key = 'openai';
  SELECT id INTO v_reducto_id FROM providers WHERE tenant_id = v_tenant_id AND provider_key = 'reducto';

  INSERT INTO provider_entity_assignments (
    tenant_id,
    provider_id,
    entity_id,
    use_case,
    rollout_mode,
    owner_name,
    status
  )
  VALUES
    (v_tenant_id, v_openai_id, v_entity_id, 'Invoice + AR extraction', 'Full', 'AI Operations', 'Active'),
    (v_tenant_id, v_reducto_id, v_entity_id, 'POD and OCR fallback', 'Canary', 'AI Operations', 'Pilot')
  ON CONFLICT (entity_id, provider_id, use_case) DO UPDATE
    SET rollout_mode = EXCLUDED.rollout_mode,
        owner_name = EXCLUDED.owner_name,
        status = EXCLUDED.status,
        updated_at = now();

  INSERT INTO api_connections (
    tenant_id,
    entity_id,
    api_key,
    name,
    category,
    provider,
    base_url,
    environment,
    client_id,
    secret_reference_id,
    timeout_ms,
    notes,
    status,
    last_tested_at,
    avg_response_ms,
    success_rate_pct
  )
  VALUES
    (
      v_tenant_id, v_entity_id, 'eway-bill', 'E-Way Bill API', 'gst', 'NIC / GSTN',
      'https://api.gst.gov.in/eway', 'production', 'APP-EWAY-001',
      (SELECT id FROM secret_references WHERE tenant_id = v_tenant_id AND secret_ref = 'kv://prod/api/gstn'),
      5000, 'Required above configured threshold.', 'active', now(), 240, 99.4
    ),
    (
      v_tenant_id, v_entity_id, 'gstin-verification', 'GSTIN Verification', 'gst', 'GSTN / NIC',
      'https://api.gst.gov.in/gstin', 'production', 'APP-GST-001',
      (SELECT id FROM secret_references WHERE tenant_id = v_tenant_id AND secret_ref = 'kv://prod/api/gstn'),
      5000, 'Used during invoice validation.', 'active', now(), 210, 99.4
    ),
    (
      v_tenant_id, v_entity_id, 'pan-verification', 'PAN Verification', 'kyc', 'NSDL',
      'https://api.nsdl.co.in/pan', 'production', 'APP-PAN-001',
      (SELECT id FROM secret_references WHERE tenant_id = v_tenant_id AND secret_ref = 'kv://prod/api/nsdl'),
      5000, 'Identity verification for onboarding.', 'active', now(), 280, 99.8
    ),
    (
      v_tenant_id, v_entity_id, 'penny-drop', 'Penny Drop', 'bank', 'Razorpay',
      'https://api.razorpay.com/pennydrop', 'production', 'APP-BANK-001',
      (SELECT id FROM secret_references WHERE tenant_id = v_tenant_id AND secret_ref = 'kv://prod/api/razorpay'),
      5000, 'Bank account verification.', 'active', now(), 320, 98.1
    ),
    (
      v_tenant_id, v_entity_id, 'gstr1-data', 'GSTR-1 Data', 'gst', 'GSTN Portal',
      'https://sandbox.gst.gov.in/gstr1', 'sandbox', 'APP-GSTR1-SBX',
      (SELECT id FROM secret_references WHERE tenant_id = v_tenant_id AND secret_ref = 'kv://prod/api/gstn'),
      5000, 'Sandbox connection for testing.', 'sandbox', now(), 440, 95.0
    ),
    (
      v_tenant_id, v_entity_id, 'payment-gateway', 'Payment Gateway', 'bank', 'Razorpay',
      'https://api.razorpay.com/payments', 'production', 'APP-PAY-001',
      (SELECT id FROM secret_references WHERE tenant_id = v_tenant_id AND secret_ref = 'kv://prod/api/razorpay'),
      5000, 'Credential rotation required.', 'failed', now(), null, null
    )
  ON CONFLICT (tenant_id, entity_id, api_key) DO UPDATE
    SET name = EXCLUDED.name,
        category = EXCLUDED.category,
        provider = EXCLUDED.provider,
        base_url = EXCLUDED.base_url,
        environment = EXCLUDED.environment,
        client_id = EXCLUDED.client_id,
        secret_reference_id = EXCLUDED.secret_reference_id,
        timeout_ms = EXCLUDED.timeout_ms,
        notes = EXCLUDED.notes,
        status = EXCLUDED.status,
        last_tested_at = EXCLUDED.last_tested_at,
        avg_response_ms = EXCLUDED.avg_response_ms,
        success_rate_pct = EXCLUDED.success_rate_pct,
        updated_at = now();

  FOR v_api_id IN
    SELECT id
      FROM api_connections
     WHERE tenant_id = v_tenant_id
       AND entity_id = v_entity_id
       AND status IN ('active', 'sandbox')
  LOOP
    INSERT INTO entity_api_assignments (tenant_id, entity_id, api_connection_id, is_enabled)
    VALUES (v_tenant_id, v_entity_id, v_api_id, true)
    ON CONFLICT (entity_id, api_connection_id) DO UPDATE
      SET is_enabled = true,
          assigned_at = now();
  END LOOP;
END;
$$;

COMMIT;