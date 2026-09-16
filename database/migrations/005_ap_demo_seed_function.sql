-- Migration 005: Demo seed function
-- Creates PL/pgSQL function: seed_entity_demo_data(p_tenant_id, p_entity_id)
-- Called automatically from the backend after an entity is created.
-- Inserts 3 vendors, 4 POs, 4 GRNs, 5 invoices, 3 e-way bills,
-- match records, exceptions, processing batches, and approval chains.

CREATE OR REPLACE FUNCTION seed_entity_demo_data(
  p_tenant_id uuid,
  p_entity_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_vendor1  uuid;
  v_vendor2  uuid;
  v_vendor3  uuid;
  v_po1      uuid;
  v_po2      uuid;
  v_po3      uuid;
  v_po4      uuid;
  v_grn1     uuid;
  v_grn2     uuid;
  v_grn3     uuid;
  v_grn4     uuid;
  v_inv1     uuid;
  v_inv2     uuid;
  v_inv3     uuid;
  v_inv4     uuid;
  v_inv5     uuid;
  v_po1_l1   uuid;
  v_po1_l2   uuid;
  v_po1_l3   uuid;
  v_po2_l1   uuid;
  v_po2_l2   uuid;
  v_po2_l3   uuid;
  v_po3_l1   uuid;
  v_po3_l2   uuid;
  v_po4_l1   uuid;
  v_inv1_l1  uuid;
  v_inv1_l2  uuid;
  v_inv1_l3  uuid;
  v_inv2_l1  uuid;
  v_inv2_l2  uuid;
  v_inv3_l1  uuid;
  v_inv3_l2  uuid;
  v_match1   uuid;
  v_match2   uuid;
  v_match3   uuid;
  v_entity_key text;
BEGIN
  -- Resolve entity key for reference strings
  SELECT entity_key INTO v_entity_key FROM entities WHERE id = p_entity_id;

  -- Skip if demo data already seeded (idempotent)
  IF EXISTS (SELECT 1 FROM ap_vendors WHERE entity_id = p_entity_id LIMIT 1) THEN
    RETURN;
  END IF;

  -- -- VENDORS --
  INSERT INTO ap_vendors (tenant_id, entity_id, vendor_code, legal_name, trade_name, vendor_type, gstin, pan, state_code, city, state, payment_terms, status)
  VALUES
    (p_tenant_id, p_entity_id, 'VND-001', 'Tata Consultancy Services Ltd', 'TCS', 'supplier',
     '27AABCT1332L1ZA', 'AABCT1332L', '27', 'Mumbai', 'Maharashtra', 'net_30', 'active'),
    (p_tenant_id, p_entity_id, 'VND-002', 'Infosys Ltd', 'Infosys', 'contractor',
     '29AABCI3014N1Z3', 'AABCI3014N', '29', 'Bengaluru', 'Karnataka', 'net_45', 'active'),
    (p_tenant_id, p_entity_id, 'VND-003', 'Wipro Technologies Ltd', 'Wipro', 'supplier',
     '29AABCW0013L1ZN', 'AABCW0013L', '29', 'Bengaluru', 'Karnataka', 'net_30', 'active');

  SELECT id INTO v_vendor1 FROM ap_vendors WHERE entity_id = p_entity_id AND vendor_code = 'VND-001';
  SELECT id INTO v_vendor2 FROM ap_vendors WHERE entity_id = p_entity_id AND vendor_code = 'VND-002';
  SELECT id INTO v_vendor3 FROM ap_vendors WHERE entity_id = p_entity_id AND vendor_code = 'VND-003';

  -- -- PURCHASE ORDERS --
  INSERT INTO ap_purchase_orders
    (tenant_id, entity_id, vendor_id, po_number, po_date, delivery_date,
     subtotal, cgst_amount, sgst_amount, total_amount, source_system, status)
  VALUES
    (p_tenant_id, p_entity_id, v_vendor1, 'PO-' || v_entity_key || '-0078',
     CURRENT_DATE - 7, CURRENT_DATE + 7,
     408474, 36763, 36763, 482000, 'sap', 'fully_received'),
    (p_tenant_id, p_entity_id, v_vendor2, 'PO-' || v_entity_key || '-0065',
     CURRENT_DATE - 12, CURRENT_DATE + 3,
     695763, 62559, 62559, 820881, 'sap', 'partially_received'),
    (p_tenant_id, p_entity_id, v_vendor3, 'PO-' || v_entity_key || '-0052',
     CURRENT_DATE - 16, CURRENT_DATE - 1,
     116071, 6964, 6964, 130000, 'erp', 'issued'),
    (p_tenant_id, p_entity_id, v_vendor1, 'PO-' || v_entity_key || '-0081',
     CURRENT_DATE - 5, CURRENT_DATE + 10,
     185169, 16661, 16661, 218491, 'sap', 'issued');

  SELECT id INTO v_po1 FROM ap_purchase_orders WHERE entity_id = p_entity_id AND po_number = 'PO-' || v_entity_key || '-0078';
  SELECT id INTO v_po2 FROM ap_purchase_orders WHERE entity_id = p_entity_id AND po_number = 'PO-' || v_entity_key || '-0065';
  SELECT id INTO v_po3 FROM ap_purchase_orders WHERE entity_id = p_entity_id AND po_number = 'PO-' || v_entity_key || '-0052';
  SELECT id INTO v_po4 FROM ap_purchase_orders WHERE entity_id = p_entity_id AND po_number = 'PO-' || v_entity_key || '-0081';

  -- -- PO LINE ITEMS --
  -- PO1 lines (TCS - Software)
  INSERT INTO ap_po_line_items
    (po_id, tenant_id, entity_id, line_number, description, hsn_sac_code, quantity, unit, unit_price, cgst_rate, sgst_rate, line_subtotal, cgst_amount, sgst_amount, line_total, received_qty, status)
  VALUES
    (v_po1, p_tenant_id, p_entity_id, 1, 'Software License - Enterprise', '99831', 10, 'units', 24100, 9, 9, 241000, 21690, 21690, 284380, 10, 'fully_received'),
    (v_po1, p_tenant_id, p_entity_id, 2, 'Implementation Services',       '99833', 40, 'hrs',   3000,  9, 9, 120000, 10800, 10800, 141600, 40, 'fully_received'),
    (v_po1, p_tenant_id, p_entity_id, 3, 'Support & Maintenance (12mo)',  '99831', 12, 'months', 10083, 9, 9, 120996, 10890, 10890, 142776, 12, 'fully_received');

  SELECT id INTO v_po1_l1 FROM ap_po_line_items WHERE po_id = v_po1 AND line_number = 1;
  SELECT id INTO v_po1_l2 FROM ap_po_line_items WHERE po_id = v_po1 AND line_number = 2;
  SELECT id INTO v_po1_l3 FROM ap_po_line_items WHERE po_id = v_po1 AND line_number = 3;

  -- PO2 lines (Infosys - Cloud)
  INSERT INTO ap_po_line_items
    (po_id, tenant_id, entity_id, line_number, description, hsn_sac_code, quantity, unit, unit_price, cgst_rate, sgst_rate, line_subtotal, cgst_amount, sgst_amount, line_total, received_qty, status)
  VALUES
    (v_po2, p_tenant_id, p_entity_id, 1, 'Cloud Hosting Services (Annual)', '99831', 12, 'months', 42000, 9, 9, 504000, 45360, 45360, 594720, 12, 'fully_received'),
    (v_po2, p_tenant_id, p_entity_id, 2, 'Data Migration Project',          '99833', 1,  'lot',   180000, 9, 9, 180000, 16200, 16200, 212400, 1,  'fully_received'),
    (v_po2, p_tenant_id, p_entity_id, 3, 'Training Sessions (4 batches)',   '99835', 4,  'batch',  9500,  9, 9,  38000,  3420,  3420,  44840, 4,  'fully_received');

  SELECT id INTO v_po2_l1 FROM ap_po_line_items WHERE po_id = v_po2 AND line_number = 1;
  SELECT id INTO v_po2_l2 FROM ap_po_line_items WHERE po_id = v_po2 AND line_number = 2;
  SELECT id INTO v_po2_l3 FROM ap_po_line_items WHERE po_id = v_po2 AND line_number = 3;

  -- PO3 lines (Wipro - Network)
  INSERT INTO ap_po_line_items
    (po_id, tenant_id, entity_id, line_number, description, hsn_sac_code, quantity, unit, unit_price, cgst_rate, sgst_rate, line_subtotal, cgst_amount, sgst_amount, line_total, received_qty, status)
  VALUES
    (v_po3, p_tenant_id, p_entity_id, 1, 'Network Switches (24-port)', '85176', 20, 'units', 4000, 6, 6, 80000, 4800, 4800, 89600, 0, 'open'),
    (v_po3, p_tenant_id, p_entity_id, 2, 'Installation & Config',      '99833', 10, 'hrs',   2000, 6, 6, 20000, 1200, 1200, 22400, 0, 'open');

  SELECT id INTO v_po3_l1 FROM ap_po_line_items WHERE po_id = v_po3 AND line_number = 1;
  SELECT id INTO v_po3_l2 FROM ap_po_line_items WHERE po_id = v_po3 AND line_number = 2;

  -- PO4 lines (TCS - Consulting)
  INSERT INTO ap_po_line_items
    (po_id, tenant_id, entity_id, line_number, description, hsn_sac_code, quantity, unit, unit_price, cgst_rate, sgst_rate, line_subtotal, cgst_amount, sgst_amount, line_total, received_qty, status)
  VALUES
    (v_po4, p_tenant_id, p_entity_id, 1, 'IT Consulting (50 days)', '99833', 50, 'days', 3500, 9, 9, 175000, 15750, 15750, 206500, 0, 'open');

  SELECT id INTO v_po4_l1 FROM ap_po_line_items WHERE po_id = v_po4 AND line_number = 1;

  -- -- GOODS RECEIPTS --
  INSERT INTO ap_goods_receipts
    (tenant_id, entity_id, po_id, vendor_id, grn_number, grn_date, subtotal, total_tax, total_amount, status)
  VALUES
    (p_tenant_id, p_entity_id, v_po1, v_vendor1, 'GRN-' || v_entity_key || '-0311', CURRENT_DATE - 3,  408474, 73526, 482000, 'accepted'),
    (p_tenant_id, p_entity_id, v_po2, v_vendor2, 'GRN-' || v_entity_key || '-0298', CURRENT_DATE - 5,  695763, 62559, 758322, 'accepted'),
    (p_tenant_id, p_entity_id, v_po2, v_vendor2, 'GRN-' || v_entity_key || '-0299', CURRENT_DATE - 8,  180000, 32400, 212400, 'accepted'),
    (p_tenant_id, p_entity_id, v_po3, v_vendor3, 'GRN-' || v_entity_key || '-0280', CURRENT_DATE - 9,  116071,  6964, 130000, 'pending');

  SELECT id INTO v_grn1 FROM ap_goods_receipts WHERE entity_id = p_entity_id AND grn_number = 'GRN-' || v_entity_key || '-0311';
  SELECT id INTO v_grn2 FROM ap_goods_receipts WHERE entity_id = p_entity_id AND grn_number = 'GRN-' || v_entity_key || '-0298';
  SELECT id INTO v_grn3 FROM ap_goods_receipts WHERE entity_id = p_entity_id AND grn_number = 'GRN-' || v_entity_key || '-0299';
  SELECT id INTO v_grn4 FROM ap_goods_receipts WHERE entity_id = p_entity_id AND grn_number = 'GRN-' || v_entity_key || '-0280';

  -- GRN line items
  INSERT INTO ap_grn_line_items
    (grn_id, po_line_item_id, tenant_id, entity_id, line_number, description, hsn_sac_code, quantity_ordered, quantity_received, quantity_accepted, unit, unit_price, line_total, status)
  VALUES
    (v_grn1, v_po1_l1, p_tenant_id, p_entity_id, 1, 'Software License - Enterprise', '99831', 10, 10, 10, 'units', 24100, 241000, 'accepted'),
    (v_grn1, v_po1_l2, p_tenant_id, p_entity_id, 2, 'Implementation Services',       '99833', 40, 40, 40, 'hrs',   3000,  120000, 'accepted'),
    (v_grn1, v_po1_l3, p_tenant_id, p_entity_id, 3, 'Support & Maintenance (12mo)',  '99831', 12, 12, 12, 'months',10083, 120996, 'accepted'),
    (v_grn4, v_po3_l1, p_tenant_id, p_entity_id, 1, 'Network Switches (24-port)',    '85176', 20, 18, 18, 'units', 4000,  72000, 'partially_accepted');

  -- -- INVOICES --
  INSERT INTO ap_invoices
    (tenant_id, entity_id, vendor_id, invoice_number, invoice_date, due_date,
     subtotal, cgst_amount, sgst_amount, total_amount, payment_terms,
     source_channel, status, po_ref, grn_ref)
  VALUES
    (p_tenant_id, p_entity_id, v_vendor1, 'INV-' || v_entity_key || '-2291',
     CURRENT_DATE,     CURRENT_DATE + 30,
     408474, 36763, 36763, 482000, 'net_30', 'sap',    'matched',
     'PO-' || v_entity_key || '-0078', 'GRN-' || v_entity_key || '-0311'),
    (p_tenant_id, p_entity_id, v_vendor2, 'INV-' || v_entity_key || '-2244',
     CURRENT_DATE - 1, CURRENT_DATE + 44,
     693763, 62439, 62439, 818641, 'net_45', 'sap',    'partially_matched',
     'PO-' || v_entity_key || '-0065', 'GRN-' || v_entity_key || '-0298'),
    (p_tenant_id, p_entity_id, v_vendor3, 'INV-' || v_entity_key || '-2198',
     CURRENT_DATE - 3, CURRENT_DATE + 27,
     109893,  6594,  6594, 123081, 'net_30', 'upload', 'unmatched',
     'PO-' || v_entity_key || '-0052', 'GRN-' || v_entity_key || '-0280'),
    (p_tenant_id, p_entity_id, v_vendor1, 'INV-' || v_entity_key || '-2310',
     CURRENT_DATE,     CURRENT_DATE + 30,
     185169, 16661, 16661, 218491, 'net_30', 'sap',    'matched',
     'PO-' || v_entity_key || '-0081', NULL),
    (p_tenant_id, p_entity_id, v_vendor2, 'INV-' || v_entity_key || '-2155',
     CURRENT_DATE - 7, CURRENT_DATE + 38,
     152542, 13729, 13729, 180000, 'net_45', 'vendor', 'approved',
     'PO-' || v_entity_key || '-0065', 'GRN-' || v_entity_key || '-0299');

  SELECT id INTO v_inv1 FROM ap_invoices WHERE entity_id = p_entity_id AND invoice_number = 'INV-' || v_entity_key || '-2291';
  SELECT id INTO v_inv2 FROM ap_invoices WHERE entity_id = p_entity_id AND invoice_number = 'INV-' || v_entity_key || '-2244';
  SELECT id INTO v_inv3 FROM ap_invoices WHERE entity_id = p_entity_id AND invoice_number = 'INV-' || v_entity_key || '-2198';
  SELECT id INTO v_inv4 FROM ap_invoices WHERE entity_id = p_entity_id AND invoice_number = 'INV-' || v_entity_key || '-2310';
  SELECT id INTO v_inv5 FROM ap_invoices WHERE entity_id = p_entity_id AND invoice_number = 'INV-' || v_entity_key || '-2155';

  -- Invoice line items (INV1)
  INSERT INTO ap_invoice_line_items
    (invoice_id, po_line_item_id, tenant_id, entity_id, line_number, description, hsn_sac_code, quantity, unit, unit_price, cgst_rate, sgst_rate, line_subtotal, cgst_amount, sgst_amount, line_total, match_status)
  VALUES
    (v_inv1, v_po1_l1, p_tenant_id, p_entity_id, 1, 'Software License - Enterprise', '99831', 10, 'units', 24100, 9, 9, 241000, 21690, 21690, 284380, 'matched'),
    (v_inv1, v_po1_l2, p_tenant_id, p_entity_id, 2, 'Implementation Services',       '99833', 40, 'hrs',   3000,  9, 9, 120000, 10800, 10800, 141600, 'matched'),
    (v_inv1, v_po1_l3, p_tenant_id, p_entity_id, 3, 'Support & Maintenance (12mo)',  '99831', 12, 'months',10083, 9, 9, 120996, 10890, 10890, 142776, 'matched');

  SELECT id INTO v_inv1_l1 FROM ap_invoice_line_items WHERE invoice_id = v_inv1 AND line_number = 1;
  SELECT id INTO v_inv1_l2 FROM ap_invoice_line_items WHERE invoice_id = v_inv1 AND line_number = 2;
  SELECT id INTO v_inv1_l3 FROM ap_invoice_line_items WHERE invoice_id = v_inv1 AND line_number = 3;

  -- Invoice line items (INV2 - partial match, variance on line 2)
  INSERT INTO ap_invoice_line_items
    (invoice_id, po_line_item_id, tenant_id, entity_id, line_number, description, hsn_sac_code, quantity, unit, unit_price, cgst_rate, sgst_rate, line_subtotal, cgst_amount, sgst_amount, line_total, match_status)
  VALUES
    (v_inv2, v_po2_l1, p_tenant_id, p_entity_id, 1, 'Cloud Hosting Services (Annual)', '99831', 12, 'months', 42000, 9, 9, 504000, 45360, 45360, 594720, 'matched'),
    (v_inv2, v_po2_l2, p_tenant_id, p_entity_id, 2, 'Data Migration Project',          '99833', 1,  'lot',   178000, 9, 9, 178000, 16020, 16020, 210040, 'partial'),
    (v_inv2, v_po2_l3, p_tenant_id, p_entity_id, 3, 'Training Sessions (4 batches)',   '99835', 4,  'batch',  9500,  9, 9,  38000,  3420,  3420,  44840, 'matched');

  SELECT id INTO v_inv2_l1 FROM ap_invoice_line_items WHERE invoice_id = v_inv2 AND line_number = 1;
  SELECT id INTO v_inv2_l2 FROM ap_invoice_line_items WHERE invoice_id = v_inv2 AND line_number = 2;

  -- Invoice line items (INV3 - qty mismatch)
  INSERT INTO ap_invoice_line_items
    (invoice_id, po_line_item_id, tenant_id, entity_id, line_number, description, hsn_sac_code, quantity, unit, unit_price, cgst_rate, sgst_rate, line_subtotal, cgst_amount, sgst_amount, line_total, match_status)
  VALUES
    (v_inv3, v_po3_l1, p_tenant_id, p_entity_id, 1, 'Network Switches (24-port)', '85176', 18, 'units', 4000, 6, 6, 72000, 4320, 4320, 80640, 'unmatched'),
    (v_inv3, v_po3_l2, p_tenant_id, p_entity_id, 2, 'Installation & Config',      '99833', 10, 'hrs',   2000, 6, 6, 20000, 1200, 1200, 22400, 'matched');

  SELECT id INTO v_inv3_l1 FROM ap_invoice_line_items WHERE invoice_id = v_inv3 AND line_number = 1;
  SELECT id INTO v_inv3_l2 FROM ap_invoice_line_items WHERE invoice_id = v_inv3 AND line_number = 2;

  -- -- E-WAY BILLS --
  INSERT INTO ap_eway_bills
    (tenant_id, entity_id, invoice_id, po_id, eway_bill_number, eway_bill_date,
     valid_until, supply_type, doc_type, doc_number, doc_date,
     gstin_supplier, gstin_recipient, legal_name_supplier, legal_name_recipient,
     from_pincode, to_pincode, total_value, cgst_value, sgst_value, taxable_amount,
     distance_km, transporter_name, transport_mode, vehicle_number, status)
  VALUES
    (p_tenant_id, p_entity_id, v_inv1, v_po1,
     '980625' || LPAD((EXTRACT(EPOCH FROM now())::bigint % 1000000)::text, 6, '0'),
     now() - interval '3 days', now() + interval '4 days',
     'inward', 'invoice', 'INV-' || v_entity_key || '-2291', CURRENT_DATE,
     '27AABCT1332L1ZA', '27XXXXX0000X1Z0', 'Tata Consultancy Services Ltd', 'Entity Company',
     '400093', '400001', 482000, 36763, 36763, 408474,
     12, 'Blue Dart Express', 'road', 'MH01AB1234', 'delivered'),
    (p_tenant_id, p_entity_id, v_inv2, v_po2,
     '980626' || LPAD((EXTRACT(EPOCH FROM now())::bigint % 999999)::text, 6, '0'),
     now() - interval '1 day', now() + interval '6 days',
     'inward', 'invoice', 'INV-' || v_entity_key || '-2244', CURRENT_DATE - 1,
     '29AABCI3014N1Z3', '27XXXXX0000X1Z0', 'Infosys Ltd', 'Entity Company',
     '560100', '400001', 818641, 62439, 62439, 693763,
     1400, 'DTDC Logistics', 'road', 'KA05CD5678', 'in_transit'),
    (p_tenant_id, p_entity_id, v_inv3, v_po3,
     '980627' || LPAD((EXTRACT(EPOCH FROM now())::bigint % 998999)::text, 6, '0'),
     now() - interval '9 days', now() - interval '2 days',
     'inward', 'invoice', 'INV-' || v_entity_key || '-2198', CURRENT_DATE - 3,
     '29AABCW0013L1ZN', '27XXXXX0000X1Z0', 'Wipro Technologies Ltd', 'Entity Company',
     '560035', '400001', 123081, 6594, 6594, 109893,
     1380, 'Delhivery', 'road', 'KA03EF9012', 'expired');

  -- -- DOCUMENT MATCHES --
  INSERT INTO ap_document_matches
    (tenant_id, entity_id, invoice_id, po_id, grn_id, match_type, match_status,
     match_score_pct, auto_resolved, total_variance, matched_at)
  VALUES
    (p_tenant_id, p_entity_id, v_inv1, v_po1, v_grn1, 'three_way', 'matched',
     100.00, true, 0, now() - interval '3 days'),
    (p_tenant_id, p_entity_id, v_inv2, v_po2, v_grn2, 'three_way', 'partial',
     94.30, false, 2000, now() - interval '1 day'),
    (p_tenant_id, p_entity_id, v_inv3, v_po3, v_grn4, 'three_way', 'unmatched',
     61.20, false, 8000, now() - interval '3 days');

  SELECT id INTO v_match1 FROM ap_document_matches WHERE entity_id = p_entity_id AND invoice_id = v_inv1;
  SELECT id INTO v_match2 FROM ap_document_matches WHERE entity_id = p_entity_id AND invoice_id = v_inv2;
  SELECT id INTO v_match3 FROM ap_document_matches WHERE entity_id = p_entity_id AND invoice_id = v_inv3;

  -- Match variances (INV2 - price variance on line 2)
  INSERT INTO ap_match_variances
    (match_id, tenant_id, entity_id, invoice_line_id, po_line_id,
     field_name, po_value, invoice_value, variance_amount, variance_pct,
     tolerance_pct, within_tolerance, variance_type, status)
  VALUES
    (v_match2, p_tenant_id, p_entity_id, v_inv2_l2, v_po2_l2,
     'unit_price', '180000', '178000', -2000, -1.11,
     2.0, true, 'unit_price', 'open');

  -- Match variances (INV3 - quantity mismatch)
  INSERT INTO ap_match_variances
    (match_id, tenant_id, entity_id, invoice_line_id, po_line_id,
     field_name, po_value, invoice_value, grn_value, variance_amount, variance_pct,
     tolerance_pct, within_tolerance, variance_type, status)
  VALUES
    (v_match3, p_tenant_id, p_entity_id, v_inv3_l1, v_po3_l1,
     'quantity', '20', '18', '18', -8000, -10.00,
     0.0, false, 'quantity', 'open');

  -- -- INVOICE APPROVALS --
  -- INV1 - fully approved
  INSERT INTO ap_invoice_approvals
    (tenant_id, entity_id, invoice_id, approval_level, approver_role_key, status, action_at, notes)
  VALUES
    (p_tenant_id, p_entity_id, v_inv1, 1, 'ap_manager',          'approved', now() - interval '2 days', 'PO verified'),
    (p_tenant_id, p_entity_id, v_inv1, 2, 'finance_controller',  'approved', now() - interval '1 day',  '3-way match passed'),
    (p_tenant_id, p_entity_id, v_inv1, 3, 'entity_admin',        'approved', now() - interval '6 hours','Cleared for payment');

  -- INV2 - pending L2
  INSERT INTO ap_invoice_approvals
    (tenant_id, entity_id, invoice_id, approval_level, approver_role_key, status, action_at, notes)
  VALUES
    (p_tenant_id, p_entity_id, v_inv2, 1, 'ap_manager',         'approved', now() - interval '1 day', 'PO verified'),
    (p_tenant_id, p_entity_id, v_inv2, 2, 'finance_controller', 'pending',  null, null);

  -- INV5 - all approved
  INSERT INTO ap_invoice_approvals
    (tenant_id, entity_id, invoice_id, approval_level, approver_role_key, status, action_at, notes)
  VALUES
    (p_tenant_id, p_entity_id, v_inv5, 1, 'ap_manager',         'approved', now() - interval '6 days', 'Verified'),
    (p_tenant_id, p_entity_id, v_inv5, 2, 'finance_controller', 'approved', now() - interval '5 days', 'Approved'),
    (p_tenant_id, p_entity_id, v_inv5, 3, 'entity_admin',       'approved', now() - interval '4 days', 'Released');

  -- -- EXCEPTIONS (entity_exceptions - migration 003) --
  INSERT INTO entity_exceptions
    (tenant_id, entity_id, exception_key, title, invoice_ref, severity, status, reason_code, amount_num, owner_name, backup_name, sla_minutes, data)
  VALUES
    (p_tenant_id, p_entity_id, 'EXC-' || v_entity_key || '-001',
     'Invoice quantity less than PO',
     'INV-' || v_entity_key || '-2198', 'high', 'open', 'QTY_VARIANCE', 123081,
     'Primary Approver', 'Backup Owner', 240,
     jsonb_build_object('ref', 'INV-' || v_entity_key || '-2198 . Wipro Technologies',
                        'tags', '["Qty mismatch"]'::jsonb,
                        'timeline', '[["Now","Exception raised from 3-way match"]]'::jsonb)),
    (p_tenant_id, p_entity_id, 'EXC-' || v_entity_key || '-002',
     'Price variance on data migration line',
     'INV-' || v_entity_key || '-2244', 'medium', 'in_progress', 'PRICE_VARIANCE', 818641,
     'Primary Approver', 'Backup Owner', 360,
     jsonb_build_object('ref', 'INV-' || v_entity_key || '-2244 . Infosys Ltd',
                        'tags', '["Price variance"]'::jsonb,
                        'timeline', '[["Now","Exception auto-raised by match engine"]]'::jsonb));

  -- -- PROCESSING BATCHES (entity_processing_batches - migration 003) --
  INSERT INTO entity_processing_batches
    (tenant_id, entity_id, batch_id, document_type, source_channel, pdf_count, page_count, active_step, completed_steps, status, stop_reason, uploaded_at)
  VALUES
    (p_tenant_id, p_entity_id, 'BATCH-' || v_entity_key || '-001', 'Invoice',        'sap',    1, 7,  5, ARRAY[0,1,2,3,4],   'completed', 'All processing stages completed successfully.', now() - interval '1 day'),
    (p_tenant_id, p_entity_id, 'BATCH-' || v_entity_key || '-002', 'Purchase Order', 'sap',    1, 5,  1, ARRAY[0],            'stopped',   'Duplicate check waiting for source document hash.', now() - interval '2 hours'),
    (p_tenant_id, p_entity_id, 'BATCH-' || v_entity_key || '-003', 'Invoice',        'upload', 2, 11, 3, ARRAY[0,1,2],       'stopped',   'Tariff mapping could not find an active code.', now() - interval '3 hours'),
    (p_tenant_id, p_entity_id, 'BATCH-' || v_entity_key || '-004', 'Remittance',     'vendor', 1, 4,  2, ARRAY[0,1],         'stopped',   'Classification confidence below 85% threshold.', now() - interval '5 hours'),
    (p_tenant_id, p_entity_id, 'BATCH-' || v_entity_key || '-005', 'Credit Note',    'vendor', 1, 3,  4, ARRAY[0,1,2,3],     'stopped',   'Manual review required before approval.', now() - interval '8 hours');

  -- -- entity_invoices cache (migration 003 table - synced from ap_invoices) --
  INSERT INTO entity_invoices
    (tenant_id, entity_id, invoice_key, vendor_name, gstin, amount_num, po_ref, grn_ref,
     match_status, variance_amount, invoice_date, data)
  SELECT
    p_tenant_id, p_entity_id, i.invoice_number, v.legal_name, v.gstin,
    i.total_amount,
    i.po_ref, i.grn_ref,
    CASE i.status
      WHEN 'matched'           THEN 'matched'
      WHEN 'partially_matched' THEN 'partial'
      WHEN 'unmatched'         THEN 'unmatched'
      WHEN 'disputed'          THEN 'disputed'
      ELSE 'pending'
    END,
    COALESCE(dm.total_variance, 0),
    i.invoice_date,
    jsonb_build_object(
      'lineItems', '[]'::jsonb,
      'poData',    jsonb_build_object('amount', i.total_amount::text, 'vendor', v.legal_name, 'date', i.invoice_date::text, 'terms', i.payment_terms),
      'invData',   jsonb_build_object('amount', i.total_amount::text, 'vendor', v.legal_name, 'date', i.invoice_date::text, 'terms', i.payment_terms),
      'grnData',   '{}'::jsonb,
      'approvals', '[]'::jsonb
    )
  FROM ap_invoices i
  JOIN ap_vendors v ON v.id = i.vendor_id
  LEFT JOIN ap_document_matches dm ON dm.invoice_id = i.id
  WHERE i.entity_id = p_entity_id
  ON CONFLICT (entity_id, invoice_key) DO NOTHING;

END;
$$;

-- -- Convenience: auto-seed trigger on entity creation --
-- Triggered after INSERT on entities; calls the seed function for the new entity.
-- Set SKIP_DEMO_SEED = 'true' in session to bypass (for production use).

CREATE OR REPLACE FUNCTION trg_auto_seed_entity_demo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.skip_demo_seed', true) <> 'true' THEN
    PERFORM seed_entity_demo_data(NEW.tenant_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_seed_entity_demo ON entities;
CREATE TRIGGER auto_seed_entity_demo
  AFTER INSERT ON entities
  FOR EACH ROW
  EXECUTE FUNCTION trg_auto_seed_entity_demo();
