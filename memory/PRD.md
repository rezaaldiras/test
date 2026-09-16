# Arunika — PRD

## Problem Statement
Aplikasi keuangan & akuntansi terintegrasi untuk Badan Usaha Milik Kampung (BUMKam) di Indonesia.
Bukan CRUD sederhana: memiliki accounting engine terpusat yang menghubungkan transaksi →
subledger → jurnal → buku besar → neraca saldo → laporan keuangan. Bahasa Indonesia penuh.

## Platform & Stack
- Mobile-first Expo (React Native) + preview web. FastAPI + MongoDB (Motor).
- Auth: JWT access + refresh token berotasi (bcrypt), RBAC 7 peran.
- Ekspor laporan: CSV, Excel (openpyxl), PDF (reportlab).

## Arsitektur akuntansi
`engine.py` = SATU accounting engine. Semua modul memanggil `create_journal` (menjamin Debit=Kredit).
`ledger_lines` = general ledger; laporan dihitung dari ledger, bukan angka manual.
Void = jurnal penyeimbang (reverse), dokumen POSTED tidak pernah dihapus. Period closing memblokir
transaksi periode tertutup. Audit trail untuk setiap aksi penting.

## User Personas
- Super Admin, Direktur/Kepala BUMKam, Admin Keuangan, Admin Penjualan, Admin Pembelian,
  Admin Gudang, Auditor (read-only).

## Core Requirements (static)
- Integritas: Debit=Kredit, Aset=Liabilitas+Ekuitas, konsistensi AR/AP dengan faktur & pembayaran.
- Konfigurasi (tidak hard-code): tarif/akun pajak, akun default, metode penyusutan & persediaan,
  bagan akun, penomoran dokumen.
- Multi-unit usaha + cost center. Periode akuntansi & tutup buku.

## Implemented (2026-06)
Phase 1 (Foundation): Setup/bootstrap, Auth+RBAC, Users, Company, Business Units, Cost Centers,
Chart of Accounts (template standar + kustom), Fiscal Periods, Dashboard KPI + grafik.
Phase 2 (Core Accounting): Automatic Journal Engine, Manual Journal, General Ledger, Trial Balance,
Period Closing/Reopening, Audit Trail.
Phase 3 (Transaction): Penjualan (faktur tunai/kredit + penerimaan piutang + void),
Pembelian (faktur + pembayaran utang + void), Kas & Bank (masuk/keluar/transfer + void),
Pelanggan, Pemasok.
Phase 5 (Reporting, sebagian): Laba Rugi, Posisi Keuangan (Neraca), Arus Kas (operasi/investasi/
pendanaan), Neraca Saldo, Umur Piutang, Umur Utang, Register Jurnal, Buku Besar — semua dengan
filter periode/unit & ekspor CSV/Excel/PDF.
Konfigurasi pajak & akun default (dapat diubah). Saldo awal via jurnal manual berimbang.
12 automated accounting integrity tests LULUS (tests/test_accounting.py).

## Backlog (prioritas)
- P1: Persediaan perpetual + HPP otomatis, Aset Tetap + penyusutan, modul Pajak lengkap
  (bukti potong, tax report), Approval workflow, Bank reconciliation.
- P2: Budgeting & Budget vs Actual, rasio keuangan, cash forecasting, attachment/dokumen
  (Object Storage), import Excel/CSV master data, notifikasi in-app, Laporan Perubahan Ekuitas & CALK,
  laporan komparatif multi-periode, retur penjualan/pembelian, quotation/SO/PO.

## Next Tasks
- Inventory & Fixed Asset (Phase 4) dengan integrasi jurnal otomatis.
- Attachment bukti transaksi via Emergent Object Storage.
