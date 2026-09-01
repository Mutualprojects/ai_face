"""Repository layer — the ONLY place that touches Supabase tables.

Services and routes never build table queries themselves; they call these
modules so persistence stays testable and swappable.
"""
