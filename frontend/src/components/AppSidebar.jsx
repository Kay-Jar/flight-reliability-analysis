/**
 * AppSidebar Component
 *
 * Collapsible navigation sidebar with branding, menu items, and toggle controls.
 *
 * Features:
 * - Redux-controlled visibility state
 * - Unfoldable/narrow mode for more screen space
 * - Brand logo with full and narrow variants
 * - Close button for mobile devices
 * - Footer with toggle button
 * - Dark color scheme
 * - Fixed positioning
 *
 * @component
 * @example
 * return (
 *   <AppSidebar />
 * )
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import {
  CBadge,
  CButton,
  CCloseButton,
  CFormCheck,
  CForm,
  CFormInput,
  CFormLabel,
  CFormSelect,
  CSpinner,
  CSidebar,
  CSidebarBrand,
  CSidebarHeader,
  CSidebarNav,
} from '@coreui/react'

import { useFilters } from '../context/FiltersContext'
import { API_BASE_URL } from '../config/api'
import teamBlueLogo from '../assets/images/TeamBlueLogoCropped.png'

const toggleValue = (values, value) => {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

const makeSafeId = (value) =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')

const getSearchPlaceholder = (label) => `Search ${label.toLowerCase()}...`

const pad2 = (n) => String(n).padStart(2, '0')
const formatPresetTimestamp = (raw) => {
  if (!raw) return ''
  const value = typeof raw === 'string' && !raw.endsWith('Z') && !raw.includes('+')
    ? `${raw.replace(' ', 'T')}Z`
    : raw
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return (
    `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}/${d.getFullYear()} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  )
}
const DISPLAY_RESULT_LIMIT = 50
const DEFAULT_AIRLINE_OPTIONS = [
  'Delta Air Lines Inc.',
  'United Air Lines Inc.',
  'Southwest Airlines Co.',
  'American Airlines Inc.',
  'JetBlue Airways',
  'Alaska Airlines Inc.',
  'Spirit Air Lines',
  'Frontier Airlines Inc.',
  'Allegiant Air',
  'Hawaiian Airlines Inc.',
]
// Defaults skew toward regionals/codeshares since the mainlines above already cover the
// marketing-carrier surface. Sorted roughly by flight volume from the loaded dataset.
const DEFAULT_OP_AIRLINE_OPTIONS = [
  'SkyWest Airlines Inc.',
  'Republic Airline',
  'Simmons Airlines',
  'PSA Airlines Inc.',
  'Pinnacle Airlines Inc.',
  'Piedmont Airlines',
  'Horizon Air',
  'Mesa Airlines Inc.',
  'Commutair Aka Champlain Enterprises - Inc.',
  'GoJet Airlines LLC d/b/a United Express',
]
const DEFAULT_AIRPORT_OPTIONS = [
  'ATL',
  'ORD',
  'DEN',
  'LAX',
  'JFK',
  'DFW',
  'SFO',
  'SEA',
  'LAS',
  'MCO',
]

const mapFilterOptions = (payload) => {
  if (!Array.isArray(payload)) {
    return []
  }

  return payload
    .map((item) => {
      if (typeof item === 'string') {
        return {
          value: item,
          label: item,
        }
      }

      if (item && typeof item === 'object' && item.value) {
        return {
          value: item.value,
          label: item.label || item.value,
        }
      }

      return null
    })
    .filter(Boolean)
}

const SearchableMultiSelect = ({ label, endpoint, selectedValues, onToggle, defaultOptions }) => {
  const [searchTerm, setSearchTerm] = useState('')
  const [options, setOptions] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [hasFetched, setHasFetched] = useState(false)
  const trimmedSearchTerm = searchTerm.trim()

  useEffect(() => {
    if (!trimmedSearchTerm) {
      setOptions([])
      setError('')
      setHasFetched(false)
      setIsLoading(false)
      return undefined
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(async () => {
      setIsLoading(true)
      setError('')

      try {
        const url = new URL(`${API_BASE_URL}${endpoint}`)
        url.searchParams.set('q', trimmedSearchTerm)

        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) {
          throw new Error(`Unable to load ${label.toLowerCase()} options.`)
        }

        const payload = await response.json()
        setOptions(mapFilterOptions(payload))
      } catch (fetchError) {
        if (fetchError?.name !== 'AbortError') {
          setOptions([])
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load options.')
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
          setHasFetched(true)
        }
      }
    }, 300)

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [endpoint, label, trimmedSearchTerm])

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const displayedOptions = useMemo(() => options.slice(0, DISPLAY_RESULT_LIMIT), [options])
  const displayedDefaultOptions = useMemo(() => mapFilterOptions(defaultOptions), [defaultOptions])

  return (
    <div className="mb-4">
      <CFormLabel className="fw-semibold mb-2">{label}</CFormLabel>
      <CFormInput
        size="sm"
        value={searchTerm}
        onChange={(event) => setSearchTerm(event.target.value)}
        placeholder={getSearchPlaceholder(label)}
        className="mb-2"
      />

      {selectedValues.length > 0 ? (
        <div className="d-flex flex-wrap gap-2 mb-2">
          {selectedValues.map((value) => (
            <CBadge
              color="primary"
              shape="rounded-pill"
              key={`${label}-${value}`}
              role="button"
              onClick={() => onToggle(value)}
            >
              {value} x
            </CBadge>
          ))}
        </div>
      ) : null}

      <div className="analytics-filter-options">
        {!trimmedSearchTerm ? (
          <div className="px-2 py-2">
            <div className="small text-medium-emphasis mb-2">Common {label.toLowerCase()}:</div>
            {displayedDefaultOptions.map((option) => (
              <CFormCheck
                className="py-1"
                key={`${label}-default-${option.value}`}
                id={`${makeSafeId(label)}-default-${makeSafeId(option.value)}`}
                label={option.label}
                checked={selectedSet.has(option.value)}
                onChange={() => onToggle(option.value)}
              />
            ))}
            <div className="small text-medium-emphasis mt-2 border-top pt-2">
              Type to search all {label.toLowerCase()}.
            </div>
          </div>
        ) : null}

        {trimmedSearchTerm && isLoading ? (
          <div className="small text-medium-emphasis px-2 py-2">
            <CSpinner size="sm" className="me-2" /> Loading...
          </div>
        ) : null}

        {trimmedSearchTerm && !isLoading && error ? (
          <div className="small text-danger px-2 py-2">{error}</div>
        ) : null}

        {trimmedSearchTerm && !isLoading && !error && displayedOptions.length > 0
          ? displayedOptions.map((option) => (
              <CFormCheck
                className="px-2 py-1"
                key={`${label}-${option.value}`}
                id={`${makeSafeId(label)}-${makeSafeId(option.value)}`}
                label={option.label}
                checked={selectedSet.has(option.value)}
                onChange={() => onToggle(option.value)}
              />
            ))
          : null}

        {trimmedSearchTerm && !isLoading && !error && hasFetched && options.length === 0 ? (
          <div className="small text-medium-emphasis px-2 py-2">No matches found.</div>
        ) : null}

        {trimmedSearchTerm && !isLoading && !error && options.length > DISPLAY_RESULT_LIMIT ? (
          <div className="small text-medium-emphasis px-2 py-2 border-top">
            Showing first {DISPLAY_RESULT_LIMIT} matches. All options are searchable.
          </div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * AppSidebar functional component
 *
 * Manages sidebar state with Redux:
 * - sidebarShow: Controls sidebar visibility
 * - sidebarUnfoldable: Controls narrow/wide mode
 *
 * Renders the analysis filter controls and preset actions.
 * Memoized to prevent unnecessary re-renders.
 *
 * @returns {React.ReactElement} Sidebar with navigation
 */
const AppSidebar = () => {
  const dispatch = useDispatch()
  const unfoldable = useSelector((state) => state.sidebarUnfoldable)
  const sidebarShow = useSelector((state) => state.sidebarShow)
  const { filters, setFilters, updateFilters, resetFilters, queryMode, setQueryMode } = useFilters()
  const [delayTypeOptions, setDelayTypeOptions] = useState([])
  const [delayTypesLoading, setDelayTypesLoading] = useState(false)
  const [delayTypesError, setDelayTypesError] = useState('')

  const [presets, setPresets] = useState([])
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)

  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/presets`)
      if (res.ok) setPresets(await res.json())
    } catch {
      //silent — sidebar should not break if backend is down
    }
  }, [])

  useEffect(() => {
    fetchPresets()
  }, [fetchPresets])

  const savePreset = async () => {
    if (!presetName.trim()) return
    setSavingPreset(true)
    try {
      await fetch(`${API_BASE_URL}/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset_name: presetName.trim(),
          filters_json: JSON.stringify(filters),
        }),
      })
      setPresetName('')
      await fetchPresets()
    } catch {
      //silent
    } finally {
      setSavingPreset(false)
    }
  }

  const loadPreset = (preset) => {
    try {
      const parsed = JSON.parse(preset.filters_json)
      setFilters(parsed)
    } catch {
      // corrupt preset — ignore
    }
  }

  const overwritePreset = async (preset) => {
    try {
      await fetch(`${API_BASE_URL}/presets/${preset.preset_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset_name: preset.preset_name,
          filters_json: JSON.stringify(filters),
        }),
      })
      await fetchPresets()
    } catch {
      //silent
    }
  }

  const deletePreset = async (preset) => {
    try {
      await fetch(`${API_BASE_URL}/presets/${preset.preset_id}`, {
        method: 'DELETE',
      })
      await fetchPresets()
    } catch {
      //silent
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    const loadDelayTypes = async () => {
      setDelayTypesLoading(true)
      setDelayTypesError('')

      try {
        const response = await fetch(`${API_BASE_URL}/analysis/filters/delay-types`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error('Unable to load delay types.')
        }

        const payload = await response.json()
        setDelayTypeOptions(mapFilterOptions(payload))
      } catch (fetchError) {
        if (fetchError?.name !== 'AbortError') {
          setDelayTypesError(
            fetchError instanceof Error ? fetchError.message : 'Failed to load delay types.',
          )
          setDelayTypeOptions([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setDelayTypesLoading(false)
        }
      }
    }

    void loadDelayTypes()

    return () => controller.abort()
  }, [])

  const activeFilterCount =
    filters.airlines.length +
    filters.op_airlines.length +
    filters.airports.length +
    filters.delay_types.length +
    filters.tiers.length

  const canResetFilters =
    activeFilterCount > 0 ||
    filters.metric !== 'avg_arr_delay' ||
    filters.table_view !== 'carrier_summary'

  return (
    <CSidebar
      className="border-end"
      colorScheme="dark"
      position="fixed"
      unfoldable={unfoldable}
      visible={sidebarShow}
      onVisibleChange={(visible) => {
        dispatch({ type: 'set', sidebarShow: visible })
      }}
    >
      <CSidebarHeader className="border-bottom py-1">
        <CSidebarBrand to="/" className="justify-content-center align-items-center px-0 py-0">
          <img
            src={teamBlueLogo}
            alt="Team Blue"
            style={{ maxHeight: '48px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </CSidebarBrand>
        <CCloseButton
          className="d-lg-none"
          dark
          onClick={() => dispatch({ type: 'set', sidebarShow: false })}
        />
      </CSidebarHeader>
      <CSidebarNav className="px-3 py-3">
        <CForm>
          <div className="mb-3 d-flex align-items-center justify-content-between">
            <div>
              <div className="fw-semibold">Filters</div>
              <div className="small text-medium-emphasis">Active: {activeFilterCount}</div>
            </div>
            <CButton size="sm" color="light" onClick={resetFilters} disabled={!canResetFilters}>
              Reset
            </CButton>
          </div>

          <SearchableMultiSelect
            label="Airlines"
            endpoint="/analysis/filters/airlines"
            selectedValues={filters.airlines}
            defaultOptions={DEFAULT_AIRLINE_OPTIONS}
            onToggle={(value) =>
              updateFilters({
                airlines: toggleValue(filters.airlines, value),
              })
            }
          />

          <SearchableMultiSelect
            label="Operating Airlines"
            endpoint="/analysis/filters/op-airlines"
            selectedValues={filters.op_airlines}
            defaultOptions={DEFAULT_OP_AIRLINE_OPTIONS}
            onToggle={(value) =>
              updateFilters({
                op_airlines: toggleValue(filters.op_airlines, value),
              })
            }
          />

          <SearchableMultiSelect
            label="Airports"
            endpoint="/analysis/filters/airports"
            selectedValues={filters.airports}
            defaultOptions={DEFAULT_AIRPORT_OPTIONS}
            onToggle={(value) =>
              updateFilters({
                airports: toggleValue(filters.airports, value),
              })
            }
          />

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Delay Types</CFormLabel>
            {delayTypesLoading ? (
              <div className="small text-medium-emphasis">
                <CSpinner size="sm" className="me-2" /> Loading delay types...
              </div>
            ) : null}

            {!delayTypesLoading && delayTypesError ? (
              <div className="small text-danger">{delayTypesError}</div>
            ) : null}

            {!delayTypesLoading && !delayTypesError && delayTypeOptions.length > 0 ? (
              <div className="d-flex flex-wrap gap-2">
                {delayTypeOptions.map((option) => {
                  const selected = filters.delay_types.includes(option.value)
                  return (
                    <CButton
                      key={`delay-${option.value}`}
                      size="sm"
                      color={selected ? 'primary' : 'light'}
                      variant={selected ? undefined : 'outline'}
                      onClick={() =>
                        updateFilters({
                          delay_types: toggleValue(filters.delay_types, option.value),
                        })
                      }
                    >
                      {option.label}
                    </CButton>
                  )
                })}
              </div>
            ) : null}

            {!delayTypesLoading && !delayTypesError && delayTypeOptions.length === 0 ? (
              <div className="small text-medium-emphasis">No delay types available.</div>
            ) : null}
          </div>

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Carrier Delay Tier</CFormLabel>
            <div className="d-flex flex-wrap gap-2">
              {['Excellent', 'Good', 'Average', 'Poor'].map((tier) => {
                const selected = filters.tiers.includes(tier)
                return (
                  <CButton
                    key={`tier-${tier}`}
                    size="sm"
                    color={selected ? 'primary' : 'light'}
                    variant={selected ? undefined : 'outline'}
                    onClick={() =>
                      updateFilters({
                        tiers: toggleValue(filters.tiers, tier),
                      })
                    }
                  >
                    {tier}
                  </CButton>
                )
              })}
            </div>
            <div className="small text-medium-emphasis mt-1">
              Tiers are computed fleet-wide vs. the global average arrival delay.
            </div>
          </div>

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Metric</CFormLabel>
            <CFormSelect
              size="sm"
              value={filters.metric}
              onChange={(event) => updateFilters({ metric: event.target.value })}
            >
              <option value="avg_arr_delay">Average Arrival Delay</option>
              <option value="total_flights">Total Flights</option>
            </CFormSelect>
          </div>

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Table View</CFormLabel>
            <CFormSelect
              size="sm"
              value={filters.table_view}
              onChange={(event) => updateFilters({ table_view: event.target.value })}
            >
              <option value="carrier_summary">Carrier Summary</option>
              <option value="raw_flights">Raw Flight Records</option>
            </CFormSelect>
          </div>
        </CForm>

        <hr className="border-secondary my-3" />

        <div>
          <CFormLabel className="fw-semibold mb-2">Saved Presets</CFormLabel>
          <div className="d-flex gap-1 mb-2">
            <CFormInput
              size="sm"
              placeholder="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePreset()}
            />
            <CButton
              color="primary"
              size="sm"
              disabled={!presetName.trim() || savingPreset}
              onClick={savePreset}
            >
              Save
            </CButton>
          </div>

          {presets.length > 0 && (
            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {presets.map((preset) => (
                <div
                  key={preset.preset_id}
                  className="d-flex align-items-center justify-content-between py-1"
                >
                  <div
                    className="text-truncate"
                    style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                    title={`Load "${preset.preset_name}"`}
                    onClick={() => loadPreset(preset)}
                  >
                    <div className="text-truncate small">{preset.preset_name}</div>
                    {preset.updated_at ? (
                      <div
                        className="text-medium-emphasis text-truncate"
                        style={{ fontSize: '0.7rem', lineHeight: 1.1 }}
                      >
                        {formatPresetTimestamp(preset.updated_at)}
                      </div>
                    ) : null}
                  </div>
                  <div className="d-flex gap-1 ms-1 flex-shrink-0">
                    <CButton
                      color="info"
                      variant="ghost"
                      size="sm"
                      title="Overwrite with current filters"
                      onClick={() => overwritePreset(preset)}
                      style={{ padding: '0 4px', lineHeight: 1 }}
                    >
                      ↻
                    </CButton>
                    <CButton
                      color="danger"
                      variant="ghost"
                      size="sm"
                      title="Delete preset"
                      onClick={() => deletePreset(preset)}
                      style={{ padding: '0 4px', lineHeight: 1 }}
                    >
                      ✕
                    </CButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {presets.length === 0 && (
            <div className="small text-medium-emphasis">No saved presets yet.</div>
          )}
        </div>
      </CSidebarNav>
    </CSidebar>
  )
}

export default React.memo(AppSidebar)
