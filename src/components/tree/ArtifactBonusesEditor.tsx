// ─── Artifact bonuses editor ────────────────────────────────────────────────
// Editable list for a custom artifact's `bonuses` array (Core/DB/items/items/
// *.json) — the mechanical effects a real artifact grants. Confirmed against
// every real artifact (13 files, ~185 items, 579 bonus instances): exactly
// 13 distinct `type` values, several of which (heroStat, unitStat,
// heroStatBattle) are generic "set a named key to a value" mini-languages
// rather than single mechanics — heroStat alone has 30+ distinct first-
// parameter keys.
//
// Rather than exposing those raw type/key strings, the "Effect" dropdown
// below lists ~18 plain-language effects (grouped: Hero/Magic/Creatures/
// Battle/Resources/Other) that each map onto one confirmed real
// type+parameter shape. Selecting an effect shows only the fields that
// actually vary in real data — every other parameter real artifacts never
// vary is hardcoded rather than exposed (e.g. magicSidSet's trailing "3" is
// constant across all 72 real instances; only the spell varies). An
// "Advanced (raw parameters)" escape hatch at the bottom covers anything
// that doesn't match a known shape, so nothing is ever unrepresentable.
//
// Switching a bonus's Effect resets it to that effect's defaults, dropping
// any other side fields the old effect had (`upgrade`, `receiverAllegiance`,
// `activationLevel`) — editing fields *within* an effect (the attribute,
// its value, its targeting) preserves those side fields untouched.

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2 } from '@/components/ui/icons'
import EntityCombobox from '@/components/common/EntityCombobox'
import StringListEditor from '@/components/common/StringListEditor'
import { BASIC_RESOURCE_IDS } from '@/lib/resources'
import {
  HERO_ATTRIBUTES,
  UNIT_ATTRIBUTES,
  BATTLE_HERO_ATTRIBUTES,
  MAGIC_SCHOOL_OPTIONS,
  MAGIC_SCHOOL_OPTIONS_WITH_NEUTRAL,
  SPELL_TIER_OPTIONS,
  DAMAGE_MOD_OPTIONS,
  COMBAT_BUFF_TARGETS,
  attributeById,
  percentToDisplay,
  displayToPercent,
  type AttributeDef,
} from '@/lib/artifact-bonus-catalog'
import { useTranslation } from 'react-i18next'
import { resourceName } from '@/lib/game-labels'

type RawBonus = Record<string, unknown>

function typeOf(bonus: RawBonus): string {
  return typeof bonus.type === 'string' ? bonus.type : ''
}
function paramsOf(bonus: RawBonus): string[] {
  return Array.isArray(bonus.parameters) ? (bonus.parameters as string[]) : []
}

function defaultValueForAttr(attr: AttributeDef): string {
  if (attr.valueKind === 'boolean') return attr.trueValue ?? 'true'
  if (attr.valueKind === 'percent') return '0.1'
  return '1'
}

// ─── Effect catalog ──────────────────────────────────────────────────────────

interface EffectDef {
  id: string
  label: string
  group: string
  matches: (bonus: RawBonus) => boolean
  makeDefault: () => RawBonus
}

const EFFECT_DEFS: EffectDef[] = [
  {
    id: 'hero-stat',
    label: 'Boost a Hero Stat',
    group: 'Hero',
    matches: (b) => typeOf(b) === 'heroStat' && paramsOf(b).length === 2 && !!attributeById(HERO_ATTRIBUTES, paramsOf(b)[0]),
    makeDefault: () => ({ type: 'heroStat', parameters: [HERO_ATTRIBUTES[0].id, defaultValueForAttr(HERO_ATTRIBUTES[0])] }),
  },
  {
    id: 'grant-skill',
    label: 'Grant a Skill',
    group: 'Hero',
    matches: (b) => typeOf(b) === 'heroTemporallyActiveSubSkills' && paramsOf(b).length === 1,
    makeDefault: () => ({ type: 'heroTemporallyActiveSubSkills', parameters: [''] }),
  },
  {
    id: 'grant-spell',
    label: 'Grant a Spell (always known)',
    group: 'Magic',
    matches: (b) => typeOf(b) === 'heroStat' && paramsOf(b)[0] === 'magicSidSet' && paramsOf(b).length === 3 && paramsOf(b)[2] === '3',
    makeDefault: () => ({ type: 'heroStat', parameters: ['magicSidSet', '', '3'] }),
  },
  {
    id: 'free-cast-spell',
    label: 'Make a Spell Free to Cast',
    group: 'Magic',
    matches: (b) => typeOf(b) === 'heroStat' && paramsOf(b)[0] === 'magicCostSidSet' && paramsOf(b).length === 4 && paramsOf(b)[2] === '-999' && paramsOf(b)[3] === '0',
    makeDefault: () => ({ type: 'heroStat', parameters: ['magicCostSidSet', '', '-999', '0'] }),
  },
  {
    id: 'spell-level-boost',
    label: "Boost a Magic School's Spell Level",
    group: 'Magic',
    matches: (b) => typeOf(b) === 'heroStat' && paramsOf(b)[0] === 'magicSchoolSet' && paramsOf(b).length === 4 && paramsOf(b)[2] === '0' && paramsOf(b)[3] === '1',
    makeDefault: () => ({ type: 'heroStat', parameters: ['magicSchoolSet', MAGIC_SCHOOL_OPTIONS[0].id, '0', '1'] }),
  },
  {
    id: 'ignore-school-restriction',
    label: 'Ignore "Same School Twice" Rule',
    group: 'Magic',
    matches: (b) => typeOf(b) === 'heroStat' && paramsOf(b)[0] === 'magicCounterSet' && paramsOf(b).length === 6
      && paramsOf(b)[2] === '0' && paramsOf(b)[3] === 'true' && paramsOf(b)[4] === 'false' && paramsOf(b)[5] === '0',
    makeDefault: () => ({ type: 'heroStat', parameters: ['magicCounterSet', MAGIC_SCHOOL_OPTIONS_WITH_NEUTRAL[0].id, '0', 'true', 'false', '0'] }),
  },
  {
    id: 'grant-school-tier-spells',
    label: 'Grant Spells of a School/Tier',
    group: 'Magic',
    matches: (b) => typeOf(b) === 'heroMagicAdditionMass' && paramsOf(b).length === 3 && paramsOf(b)[1] === 'any',
    makeDefault: () => ({ type: 'heroMagicAdditionMass', parameters: ['any', 'any', 'any'] }),
  },
  {
    id: 'replace-spell',
    label: 'Replace a Spell',
    group: 'Magic',
    matches: (b) => typeOf(b) === 'heroMagicReplace' && paramsOf(b).length === 2,
    makeDefault: () => ({ type: 'heroMagicReplace', parameters: ['', ''] }),
  },
  {
    id: 'unit-stat',
    label: 'Boost a Creature Stat',
    group: 'Creatures',
    matches: (b) => typeOf(b) === 'unitStat' && paramsOf(b).length === 2 && !!attributeById(UNIT_ATTRIBUTES, paramsOf(b)[0]),
    makeDefault: () => ({ type: 'unitStat', parameters: [UNIT_ATTRIBUTES[0].id, defaultValueForAttr(UNIT_ATTRIBUTES[0])] }),
  },
  {
    id: 'unit-damage-mod',
    label: 'Modify Creature Damage',
    group: 'Creatures',
    matches: (b) => {
      if (typeOf(b) !== 'unitStat') return false
      const p = paramsOf(b)
      return p.length === 4 && DAMAGE_MOD_OPTIONS.some((o) => o.parameters[0] === p[0] && o.parameters[1] === p[1] && o.parameters[2] === p[2])
    },
    makeDefault: () => ({ type: 'unitStat', parameters: [...DAMAGE_MOD_OPTIONS[0].parameters, '-0.1'] }),
  },
  {
    id: 'unit-trait',
    label: 'Special Creature Trait',
    group: 'Creatures',
    matches: (b) => typeOf(b) === 'unitBoolStat' && paramsOf(b).length === 2 && paramsOf(b)[0] === 'alwaysCounter',
    makeDefault: () => ({ type: 'unitBoolStat', parameters: ['alwaysCounter', 'true'] }),
  },
  {
    id: 'battle-hero-effect',
    label: 'Battle-Only Hero Effect',
    group: 'Battle',
    matches: (b) => {
      if (typeOf(b) !== 'heroStatBattle') return false
      const p = paramsOf(b)
      if (p.length === 2 && attributeById(BATTLE_HERO_ATTRIBUTES, p[0])) return true
      return p.length === 4 && p[0] === 'magicSchoolSet' && p[2] === '0' && p[3] === '-1'
    },
    makeDefault: () => ({ type: 'heroStatBattle', receiverAllegiance: 'enemy', parameters: [BATTLE_HERO_ATTRIBUTES[0].id, defaultValueForAttr(BATTLE_HERO_ATTRIBUTES[0])] }),
  },
  {
    id: 'combat-buff',
    label: 'Grant a Combat Buff',
    group: 'Battle',
    matches: (b) => typeOf(b) === 'battleSubskillBonus' && paramsOf(b).length === 2 && COMBAT_BUFF_TARGETS.some((t) => t.id === paramsOf(b)[0]),
    makeDefault: () => ({ type: 'battleSubskillBonus', parameters: ['unit_buff', ''] }),
  },
  {
    id: 'grant-resource',
    label: 'Grant a Resource Each Day',
    group: 'Resources',
    matches: (b) => typeOf(b) === 'sideRes' && paramsOf(b).length === 2 && BASIC_RESOURCE_IDS.includes(paramsOf(b)[0]),
    makeDefault: () => ({ type: 'sideRes', parameters: [BASIC_RESOURCE_IDS[0], '1'] }),
  },
  {
    id: 'faction-resource',
    label: "Grant the Faction's Special Resource",
    group: 'Resources',
    matches: (b) => typeOf(b) === 'sideFactionRes' && paramsOf(b).length === 1,
    makeDefault: () => ({ type: 'sideFactionRes', parameters: ['1'] }),
  },
  {
    id: 'city-growth',
    label: 'Boost City Creature Growth',
    group: 'Resources',
    matches: (b) => typeOf(b) === 'cityUnitsIncrementPer' && paramsOf(b).length === 2 && paramsOf(b)[0] === 'all',
    makeDefault: () => ({ type: 'cityUnitsIncrementPer', parameters: ['all', '0.5'] }),
  },
  {
    id: 'no-effect',
    label: 'No Extra Effect (Random Reward Only)',
    group: 'Other',
    matches: (b) => typeOf(b) === 'itemRandomRewardBonus' && paramsOf(b).length === 0,
    makeDefault: () => ({ type: 'itemRandomRewardBonus', parameters: [] }),
  },
  {
    id: 'raw',
    label: 'Advanced (raw parameters)',
    group: 'Other',
    matches: () => false, // never auto-selected; only reachable when nothing else matches, or picked explicitly
    makeDefault: () => ({ type: 'heroStat', parameters: [] }),
  },
]

function effectIdForBonus(bonus: RawBonus): string {
  for (const def of EFFECT_DEFS) {
    if (def.id !== 'raw' && def.matches(bonus)) return def.id
  }
  return 'raw'
}

const EFFECT_GROUPS = Array.from(new Set(EFFECT_DEFS.map((d) => d.group)))

function groupAttributes(attributes: AttributeDef[]): [string, AttributeDef[]][] {
  const groups: [string, AttributeDef[]][] = []
  for (const attr of attributes) {
    const existing = groups.find(([g]) => g === attr.group)
    if (existing) existing[1].push(attr)
    else groups.push([attr.group, [attr]])
  }
  return groups
}

// ─── Shared small field pieces ───────────────────────────────────────────────

function AttributeSelect({ attributes, value, onChange }: { attributes: AttributeDef[]; value: string; onChange: (id: string) => void }) {
  const groups = useMemo(() => groupAttributes(attributes), [attributes])
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue /></SelectTrigger>
      <SelectContent>
        {groups.map(([group, attrs]) => (
          <SelectGroup key={group}>
            <SelectLabel>{group}</SelectLabel>
            {attrs.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

function AttributeValueInput({ attr, value, onChange }: { attr: AttributeDef; value: string | undefined; onChange: (v: string) => void }) {
  const { t } = useTranslation()
  if (attr.valueKind === 'boolean') {
    const trueVal = attr.trueValue ?? 'true'
    return (
      <label className="flex items-center gap-1.5 text-xs shrink-0">
        <Checkbox checked={value === trueVal} onCheckedChange={(c) => onChange(c ? trueVal : 'false')} />
        {t('shared.on')}
      </label>
    )
  }
  if (attr.valueKind === 'percent') {
    return (
      <div className="flex items-center gap-1 shrink-0">
        <Input type="number" className="h-7 w-20 text-xs" value={percentToDisplay(value)} onChange={(e) => onChange(displayToPercent(e.target.value))} />
        <span className="text-xs text-muted-foreground">%</span>
      </div>
    )
  }
  return <Input type="number" className="h-7 w-20 text-xs shrink-0" value={value ?? '0'} onChange={(e) => onChange(e.target.value)} />
}

function AttributeBonusFields({ attributes, attrId, value, onAttrChange, onValueChange }: {
  attributes: AttributeDef[]
  attrId: string
  value: string | undefined
  onAttrChange: (id: string) => void
  onValueChange: (v: string) => void
}) {
  const attr = attributeById(attributes, attrId) ?? attributes[0]
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <AttributeSelect attributes={attributes} value={attr.id} onChange={onAttrChange} />
        <AttributeValueInput attr={attr} value={value} onChange={onValueChange} />
      </div>
      <p className="text-xs text-muted-foreground">{attr.description}</p>
    </div>
  )
}

function AllegianceToggle({ value, options, onChange }: { value: string; options: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-7 text-xs w-40 shrink-0"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

// ─── Per-effect fields ────────────────────────────────────────────────────────

function BonusFieldsEditor({ effectId, bonus, onChange }: { effectId: string; bonus: RawBonus; onChange: (bonus: RawBonus) => void }) {
  const { t } = useTranslation()
  const type = typeOf(bonus)
  const p = paramsOf(bonus)
  const setParams = (parameters: string[]) => onChange({ ...bonus, parameters })
  const setParamAt = (i: number, v: string) => {
    const next = p.slice()
    next[i] = v
    setParams(next)
  }
  const setAllegiance = (key: string, v: string | null) => {
    const next = { ...bonus }
    if (v === null) delete next[key]
    else next[key] = v
    onChange(next)
  }

  switch (effectId) {
    case 'hero-stat':
      return (
        <AttributeBonusFields
          attributes={HERO_ATTRIBUTES}
          attrId={p[0]}
          value={p[1]}
          onAttrChange={(id) => { const a = attributeById(HERO_ATTRIBUTES, id)!; setParams([id, defaultValueForAttr(a)]) }}
          onValueChange={(v) => setParamAt(1, v)}
        />
      )

    case 'grant-skill':
      return <EntityCombobox category="skill" value={p[0] ?? ''} onChange={(v) => setParams([v])} placeholder={t('shared.skill')} />

    case 'grant-spell':
      return (
        <div className="space-y-1.5">
          <EntityCombobox category="spell" value={p[1] ?? ''} onChange={(v) => setParams(['magicSidSet', v, '3'])} placeholder={t('tree.artifactBonusesEditor.spell')} />
          <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.addsTheMaxLevelVersion')}</p>
        </div>
      )

    case 'free-cast-spell':
      return (
        <div className="space-y-1.5">
          <EntityCombobox category="spell" value={p[1] ?? ''} onChange={(v) => setParams(['magicCostSidSet', v, '-999', '0'])} placeholder={t('tree.artifactBonusesEditor.spell')} />
          <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.makesThisSpellFreeTo')}</p>
        </div>
      )

    case 'spell-level-boost':
      return (
        <div className="space-y-1.5">
          <Select value={p[1] ?? MAGIC_SCHOOL_OPTIONS[0].id} onValueChange={(v) => setParams(['magicSchoolSet', v, '0', '1'])}>
            <SelectTrigger className="h-7 text-xs w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAGIC_SCHOOL_OPTIONS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.1LevelToAllSpells')}</p>
        </div>
      )

    case 'ignore-school-restriction':
      return (
        <div className="space-y-1.5">
          <Select value={p[1] ?? MAGIC_SCHOOL_OPTIONS_WITH_NEUTRAL[0].id} onValueChange={(v) => setParams(['magicCounterSet', v, '0', 'true', 'false', '0'])}>
            <SelectTrigger className="h-7 text-xs w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MAGIC_SCHOOL_OPTIONS_WITH_NEUTRAL.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t('tree.artifactBonusesEditor.letsTheHeroCastThis')}
          </p>
        </div>
      )

    case 'grant-school-tier-spells': {
      const school = p[0] ?? 'any'
      const tier = p[2] ?? 'any'
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Select value={school} onValueChange={(v) => setParams([v, 'any', tier])}>
              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t('tree.artifactBonusesEditor.anySchool')}</SelectItem>
                {MAGIC_SCHOOL_OPTIONS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={tier} onValueChange={(v) => setParams([school, 'any', v])}>
              <SelectTrigger className="h-7 text-xs w-32 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SPELL_TIER_OPTIONS.map((tr) => <SelectItem key={tr} value={tr}>{tr === 'any' ? t('tree.artifactBonusesEditor.anyTier') : `Tier ${tr}`}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.makesAllMatchingSpellsAvailable')}</p>
        </div>
      )
    }

    case 'replace-spell':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <EntityCombobox category="spell" value={p[0] ?? ''} onChange={(v) => setParamAt(0, v)} placeholder={t('tree.artifactBonusesEditor.replaceThisSpell')} />
            <span className="text-xs text-muted-foreground shrink-0">→</span>
            <EntityCombobox category="spell" value={p[1] ?? ''} onChange={(v) => setParamAt(1, v)} placeholder={t('tree.artifactBonusesEditor.withThisSpell')} />
          </div>
          <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.wheneverTheHeroWouldKnow')}</p>
        </div>
      )

    case 'unit-stat': {
      const allegiance = bonus.receiverAllegiance === 'enemy' ? 'enemy' : 'ally'
      return (
        <div className="space-y-1.5">
          <AttributeBonusFields
            attributes={UNIT_ATTRIBUTES}
            attrId={p[0]}
            value={p[1]}
            onAttrChange={(id) => { const a = attributeById(UNIT_ATTRIBUTES, id)!; setParams([id, defaultValueForAttr(a)]) }}
            onValueChange={(v) => setParamAt(1, v)}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">{t('tree.artifactBonusesEditor.affects')}</span>
            <AllegianceToggle
              value={allegiance}
              options={[{ id: 'ally', label: t('tree.artifactBonusesEditor.allegiance.ally') }, { id: 'enemy', label: t('tree.artifactBonusesEditor.allegiance.enemy') }]}
              onChange={(v) => setAllegiance('receiverAllegiance', v === 'enemy' ? 'enemy' : null)}
            />
          </div>
        </div>
      )
    }

    case 'unit-damage-mod': {
      const opt = DAMAGE_MOD_OPTIONS.find((o) => o.parameters[0] === p[0] && o.parameters[1] === p[1] && o.parameters[2] === p[2]) ?? DAMAGE_MOD_OPTIONS[0]
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Select value={opt.id} onValueChange={(id) => { const next = DAMAGE_MOD_OPTIONS.find((o) => o.id === id)!; setParams([...next.parameters, p[3] ?? '-0.1']) }}>
              <SelectTrigger className="h-7 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAMAGE_MOD_OPTIONS.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 shrink-0">
              <Input type="number" className="h-7 w-20 text-xs" value={percentToDisplay(p[3])} onChange={(e) => setParamAt(3, displayToPercent(e.target.value))} />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('tree.artifactBonusesEditor.appliesToTheWearersOwn')}
          </p>
        </div>
      )
    }

    case 'unit-trait':
      return (
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs">
            <Checkbox checked={p[1] === 'true'} onCheckedChange={(c) => setParams(['alwaysCounter', c ? 'true' : 'false'])} />
            {t('tree.artifactBonusesEditor.alwaysCounterattack')}
          </label>
          <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.friendlyCreaturesCanCounterattackEven')}</p>
        </div>
      )

    case 'battle-hero-effect': {
      const isSchool = p[0] === 'magicSchoolSet'
      const battleAttr = attributeById(BATTLE_HERO_ATTRIBUTES, p[0]) ?? BATTLE_HERO_ATTRIBUTES[0]
      const selected = isSchool ? 'magicSchoolSet' : battleAttr.id
      const allegiance = bonus.receiverAllegiance === 'all' ? 'all' : 'enemy'
      const onSelectChange = (id: string) => {
        if (id === 'magicSchoolSet') setParams(['magicSchoolSet', MAGIC_SCHOOL_OPTIONS[0].id, '0', '-1'])
        else { const a = attributeById(BATTLE_HERO_ATTRIBUTES, id)!; setParams([id, defaultValueForAttr(a)]) }
      }
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Select value={selected} onValueChange={onSelectChange}>
              <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="magicSchoolSet">{t('tree.artifactBonusesEditor.reduceEnemySpellSchoolLevel')}</SelectItem>
                {BATTLE_HERO_ATTRIBUTES.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {isSchool ? (
              <Select value={p[1] ?? MAGIC_SCHOOL_OPTIONS[0].id} onValueChange={(v) => setParams(['magicSchoolSet', v, '0', '-1'])}>
                <SelectTrigger className="h-7 text-xs w-40 shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MAGIC_SCHOOL_OPTIONS.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <AttributeValueInput attr={battleAttr} value={p[1]} onChange={(v) => setParamAt(1, v)} />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isSchool ? t('tree.artifactBonusesEditor.1LevelToTheTargets') : battleAttr.description}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">{t('tree.artifactBonusesEditor.affects')}</span>
            <AllegianceToggle
              value={allegiance}
              options={[{ id: 'enemy', label: t('tree.artifactBonusesEditor.allegiance.enemyHero') }, { id: 'all', label: t('tree.artifactBonusesEditor.allegiance.bothHeroes') }]}
              onChange={(v) => setAllegiance('receiverAllegiance', v)}
            />
          </div>
        </div>
      )
    }

    case 'combat-buff':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Select value={p[0] ?? COMBAT_BUFF_TARGETS[0].id} onValueChange={(v) => setParamAt(0, v)}>
              <SelectTrigger className="h-7 text-xs w-48 shrink-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMBAT_BUFF_TARGETS.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-0">
              <EntityCombobox category="buff" value={p[1] ?? ''} onChange={(v) => setParamAt(1, v)} placeholder={t('shared.buff')} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('tree.artifactBonusesEditor.grantsABuffStatusEffect')}
          </p>
        </div>
      )

    case 'grant-resource':
      return (
        <div className="flex items-center gap-2">
          <Select value={p[0] ?? BASIC_RESOURCE_IDS[0]} onValueChange={(v) => setParamAt(0, v)}>
            <SelectTrigger className="h-7 text-xs w-28 shrink-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BASIC_RESOURCE_IDS.map((r) => <SelectItem key={r} value={r}>{resourceName(r)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" className="h-7 w-24 text-xs" value={p[1] ?? '0'} onChange={(e) => setParamAt(1, e.target.value)} />
          <span className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.perDay')}</span>
        </div>
      )

    case 'faction-resource':
      return (
        <div className="space-y-1.5">
          <Input type="number" className="h-7 w-24 text-xs" value={p[0] ?? '1'} onChange={(e) => setParamAt(0, e.target.value)} />
          <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.producesThisMuchOfThe')}</p>
        </div>
      )

    case 'city-growth':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1">
            <Input type="number" className="h-7 w-20 text-xs" value={percentToDisplay(p[1])} onChange={(e) => setParams(['all', displayToPercent(e.target.value)])} />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.xToAllCreatureGrowth')}</p>
        </div>
      )

    case 'no-effect':
      return <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.noFieldsThisBonusOnly')}</p>

    case 'raw':
    default:
      return (
        <div className="space-y-1.5">
          <Input
            className="h-7 text-xs"
            placeholder={t('tree.artifactBonusesEditor.rawBonusTypeEG')}
            value={type}
            onChange={(e) => onChange({ ...bonus, type: e.target.value })}
          />
          <StringListEditor values={p} onChange={setParams} addLabel={t('tree.artifactBonusesEditor.addParameter')} placeholder={t('tree.artifactBonusesEditor.rawParameterValue')} />
          <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.thisBonusDoesntMatchA')}</p>
        </div>
      )
  }
}

// ─── Root component ───────────────────────────────────────────────────────────

interface ArtifactBonusesEditorProps {
  bonuses: Record<string, unknown>[]
  onChange: (bonuses: Record<string, unknown>[]) => void
}

export default function ArtifactBonusesEditor({ bonuses, onChange }: ArtifactBonusesEditorProps) {
  const { t } = useTranslation()
  const groupedEffects = useMemo(
    () => EFFECT_GROUPS.map((group) => [group, EFFECT_DEFS.filter((d) => d.group === group)] as const),
    [],
  )
  // "Advanced (raw parameters)" is a view choice, not a data shape — picking
  // it doesn't change the bonus's type/parameters (that's the point: it lets
  // you inspect/hand-edit whatever's already there), so effectIdForBonus()
  // would immediately re-match it back to a typed effect and the dropdown
  // would appear to reject the selection. This tracks "explicitly viewing
  // raw" per row instead, cleared as soon as a real effect is picked.
  const [forcedRawIndices, setForcedRawIndices] = useState<Set<number>>(new Set())

  const removeBonus = (i: number) => {
    onChange(bonuses.filter((_, idx) => idx !== i))
    setForcedRawIndices((prev) => {
      const next = new Set<number>()
      prev.forEach((idx) => {
        if (idx < i) next.add(idx)
        else if (idx > i) next.add(idx - 1)
      })
      return next
    })
  }

  return (
    <div className="space-y-2">
      {bonuses.map((bonus, i) => {
        const effectId = forcedRawIndices.has(i) ? 'raw' : effectIdForBonus(bonus)
        return (
          <div key={i} className="rounded border border-border p-2 space-y-2">
            <div className="flex items-center gap-2">
              <Select
                value={effectId}
                onValueChange={(id) => {
                  if (id === 'raw') {
                    setForcedRawIndices((prev) => new Set(prev).add(i))
                    return
                  }
                  setForcedRawIndices((prev) => {
                    if (!prev.has(i)) return prev
                    const next = new Set(prev)
                    next.delete(i)
                    return next
                  })
                  const next = EFFECT_DEFS.find((d) => d.id === id)!.makeDefault()
                  onChange(bonuses.map((b, idx) => (idx === i ? next : b)))
                }}
              >
                <SelectTrigger className="h-7 text-xs flex-1 min-w-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {groupedEffects.map(([group, defs]) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {defs.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => removeBonus(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <BonusFieldsEditor
              effectId={effectId}
              bonus={bonus}
              onChange={(next) => onChange(bonuses.map((b, idx) => (idx === i ? next : b)))}
            />
          </div>
        )
      })}
      <button
        type="button"
        className="text-xs text-primary hover:underline"
        onClick={() => onChange([...bonuses, EFFECT_DEFS[0].makeDefault()])}
      >
        {t('tree.artifactBonusesEditor.addBonus')}
      </button>
      {bonuses.length === 0 && <p className="text-xs text-muted-foreground">{t('tree.artifactBonusesEditor.noBonuses')}</p>}
    </div>
  )
}
