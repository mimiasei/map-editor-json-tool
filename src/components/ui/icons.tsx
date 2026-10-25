// The app's icons: Hugeicons (stroke, free set), exposed under the names the code used for its previous icon set so a call site only
// imports from here. Several of those names are approximate matches (e.g. ArrowDown is Hugeicons' chevron); change the mapping below to
// swap one icon. Add new icons here rather than importing @hugeicons directly.
import { forwardRef, type ComponentType, type SVGProps } from 'react'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import {
  Alert01Icon,
  AppWindowIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  BanIcon,
  BookOpenIcon,
  BotIcon,
  BoxIcon,
  BracesIcon,
  Building03Icon,
  CalendarClockIcon,
  CameraIcon,
  CastleIcon,
  ChartBarBigIcon,
  CheckIcon,
  CheckmarkCircle02Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleIcon,
  ClipboardCopyIcon,
  ClipboardPasteIcon,
  ClockIcon,
  CloudFogIcon,
  CloudUploadIcon,
  CoinsIcon,
  CopyIcon,
  CornerDownRightIcon,
  CrownIcon,
  DatabaseIcon,
  DicesIcon,
  DoorOpenIcon,
  DownloadIcon,
  DropletsIcon,
  EraserIcon,
  ExternalLinkIcon,
  EyeIcon,
  FileBracesIcon,
  FileInputIcon,
  FilePlusIcon,
  FilterIcon,
  FlagIcon,
  Flower01Icon,
  FolderOpenIcon,
  GemIcon,
  GitBranchIcon,
  GraduationCapIcon,
  HashIcon,
  HelpCircleIcon,
  Image01Icon,
  InfoIcon,
  LandPlotIcon,
  LandmarkIcon,
  LanguagesIcon,
  LayersIcon,
  DashboardSquare01Icon,
  LeafIcon,
  ListChecksIcon,
  ListIcon,
  LoaderCircleIcon,
  MapIcon,
  MapPinIcon,
  MaximizeScreenIcon,
  MessageSquareIcon,
  MilestoneIcon,
  MinusIcon,
  MoonIcon,
  MountainIcon,
  MountainSnowIcon,
  OctagonXIcon,
  PackageIcon,
  PaintbrushIcon,
  PaletteIcon,
  PanelLeftIcon,
  PenLineIcon,
  PencilIcon,
  PercentIcon,
  PickaxeIcon,
  PlusIcon,
  RedoIcon,
  RefreshCwIcon,
  RepeatIcon,
  SaveIcon,
  ScrollTextIcon,
  SearchIcon,
  Settings02Icon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldIcon,
  ShuffleIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SquareArrowOutUpRightIcon,
  SquareDashedIcon,
  SquirrelIcon,
  SunIcon,
  SwordsIcon,
  TagIcon,
  TentIcon,
  TrashIcon,
  TreesIcon,
  TrendingUpDownIcon,
  TrophyIcon,
  UndoIcon,
  UnfoldMoreIcon,
  UploadIcon,
  UserCogIcon,
  UserRoundIcon,
  UsersIcon,
  WandSparklesIcon,
  WavesIcon,
  WorkflowIcon,
  WrenchIcon,
  XIcon,
  ZapIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@hugeicons/core-free-icons'

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: string | number
  strokeWidth?: number
}
export type AppIcon = ComponentType<IconProps>

/** Stroke thickness of every icon (the icons' own data says 1.5); a call site can still pass its own strokeWidth. */
const STROKE_WIDTH = 2

function make(icon: IconSvgElement, name: string): AppIcon {
  const Icon = forwardRef<SVGSVGElement, IconProps>((props, ref) => <HugeiconsIcon ref={ref} icon={icon} strokeWidth={STROKE_WIDTH} {...props} />)
  Icon.displayName = name
  return Icon
}

export const AlertTriangle = make(Alert01Icon, 'AlertTriangle')
export const AppWindow = make(AppWindowIcon, 'AppWindow')
export const ArrowDown = make(ArrowDownIcon, 'ArrowDown')
export const ArrowLeft = make(ArrowLeftIcon, 'ArrowLeft')
export const ArrowRight = make(ArrowRightIcon, 'ArrowRight')
export const ArrowUp = make(ArrowUpIcon, 'ArrowUp')
export const Ban = make(BanIcon, 'Ban')
export const BarChart2 = make(ChartBarBigIcon, 'BarChart2')
export const BookOpen = make(BookOpenIcon, 'BookOpen')
export const Bot = make(BotIcon, 'Bot')
export const Box = make(BoxIcon, 'Box')
export const Braces = make(BracesIcon, 'Braces')
export const Building2 = make(Building03Icon, 'Building2')
export const CalendarClock = make(CalendarClockIcon, 'CalendarClock')
export const Camera = make(CameraIcon, 'Camera')
export const Castle = make(CastleIcon, 'Castle')
export const Check = make(CheckIcon, 'Check')
export const CheckCircle = make(CheckmarkCircle02Icon, 'CheckCircle')
export const CheckCircle2 = make(CheckmarkCircle02Icon, 'CheckCircle2')
export const ChevronDown = make(ChevronDownIcon, 'ChevronDown')
export const ChevronLeft = make(ChevronLeftIcon, 'ChevronLeft')
export const ChevronRight = make(ChevronRightIcon, 'ChevronRight')
export const ChevronsUpDown = make(UnfoldMoreIcon, 'ChevronsUpDown')
export const ClipboardCopy = make(ClipboardCopyIcon, 'ClipboardCopy')
export const ClipboardPaste = make(ClipboardPasteIcon, 'ClipboardPaste')
export const Clock = make(ClockIcon, 'Clock')
export const CloudFog = make(CloudFogIcon, 'CloudFog')
export const Coins = make(CoinsIcon, 'Coins')
export const Copy = make(CopyIcon, 'Copy')
export const CornerDownRight = make(CornerDownRightIcon, 'CornerDownRight')
export const Crown = make(CrownIcon, 'Crown')
export const Database = make(DatabaseIcon, 'Database')
export const Dices = make(DicesIcon, 'Dices')
export const DoorOpen = make(DoorOpenIcon, 'DoorOpen')
export const Download = make(DownloadIcon, 'Download')
export const Droplets = make(DropletsIcon, 'Droplets')
export const Eraser = make(EraserIcon, 'Eraser')
export const ExternalLink = make(ExternalLinkIcon, 'ExternalLink')
export const Eye = make(EyeIcon, 'Eye')
export const FileInput = make(FileInputIcon, 'FileInput')
export const FileJson = make(FileBracesIcon, 'FileJson')
export const FilePlus = make(FilePlusIcon, 'FilePlus')
export const Filter = make(FilterIcon, 'Filter')
export const Flag = make(FlagIcon, 'Flag')
export const Flower2 = make(Flower01Icon, 'Flower2')
export const FolderOpen = make(FolderOpenIcon, 'FolderOpen')
export const Gem = make(GemIcon, 'Gem')
export const GitBranch = make(GitBranchIcon, 'GitBranch')
export const GraduationCap = make(GraduationCapIcon, 'GraduationCap')
export const Hash = make(HashIcon, 'Hash')
export const HelpCircle = make(HelpCircleIcon, 'HelpCircle')
export const ImageIcon = make(Image01Icon, 'ImageIcon')
export const Info = make(InfoIcon, 'Info')
export const LandPlot = make(LandPlotIcon, 'LandPlot')
export const Landmark = make(LandmarkIcon, 'Landmark')
export const Languages = make(LanguagesIcon, 'Languages')
export const Layers = make(LayersIcon, 'Layers')
export const LayoutGrid = make(DashboardSquare01Icon, 'LayoutGrid')
export const Leaf = make(LeafIcon, 'Leaf')
export const List = make(ListIcon, 'List')
export const ListChecks = make(ListChecksIcon, 'ListChecks')
export const Loader2 = make(LoaderCircleIcon, 'Loader2')
export const Map = make(MapIcon, 'Map')
export const MapPin = make(MapPinIcon, 'MapPin')
export const Maximize2 = make(MaximizeScreenIcon, 'Maximize2')
export const MessageSquare = make(MessageSquareIcon, 'MessageSquare')
export const Milestone = make(MilestoneIcon, 'Milestone')
export const Minus = make(MinusIcon, 'Minus')
export const Moon = make(MoonIcon, 'Moon')
export const Mountain = make(MountainIcon, 'Mountain')
export const MountainSnow = make(MountainSnowIcon, 'MountainSnow')
export const OctagonX = make(OctagonXIcon, 'OctagonX')
export const Package = make(PackageIcon, 'Package')
export const Paintbrush = make(PaintbrushIcon, 'Paintbrush')
export const Palette = make(PaletteIcon, 'Palette')
export const PanelLeft = make(PanelLeftIcon, 'PanelLeft')
export const PenLine = make(PenLineIcon, 'PenLine')
export const Pencil = make(PencilIcon, 'Pencil')
export const Percent = make(PercentIcon, 'Percent')
export const Pickaxe = make(PickaxeIcon, 'Pickaxe')
export const Plus = make(PlusIcon, 'Plus')
export const Redo2 = make(RedoIcon, 'Redo2')
export const RefreshCw = make(RefreshCwIcon, 'RefreshCw')
export const Repeat = make(RepeatIcon, 'Repeat')
export const Repeat2 = make(RepeatIcon, 'Repeat2')
export const Save = make(SaveIcon, 'Save')
export const ScrollText = make(ScrollTextIcon, 'ScrollText')
export const Search = make(SearchIcon, 'Search')
export const Settings = make(SettingsIcon, 'Settings')
export const Settings2 = make(Settings02Icon, 'Settings2')
export const Shield = make(ShieldIcon, 'Shield')
export const ShieldCheck = make(ShieldCheckIcon, 'ShieldCheck')
export const Shuffle = make(ShuffleIcon, 'Shuffle')
export const SlidersHorizontal = make(SlidersHorizontalIcon, 'SlidersHorizontal')
export const Sparkles = make(SparklesIcon, 'Sparkles')
export const SquareArrowOutUpRight = make(SquareArrowOutUpRightIcon, 'SquareArrowOutUpRight')
export const SquareDashed = make(SquareDashedIcon, 'SquareDashed')
export const Squirrel = make(SquirrelIcon, 'Squirrel')
export const Sun = make(SunIcon, 'Sun')
export const Swords = make(SwordsIcon, 'Swords')
export const Tag = make(TagIcon, 'Tag')
export const Tent = make(TentIcon, 'Tent')
export const Trash2 = make(TrashIcon, 'Trash2')
export const Trees = make(TreesIcon, 'Trees')
export const TrendingUpDown = make(TrendingUpDownIcon, 'TrendingUpDown')
export const Trophy = make(TrophyIcon, 'Trophy')
export const Undo2 = make(UndoIcon, 'Undo2')
export const Upload = make(UploadIcon, 'Upload')
export const UploadCloud = make(CloudUploadIcon, 'UploadCloud')
export const UserCog = make(UserCogIcon, 'UserCog')
export const UserRound = make(UserRoundIcon, 'UserRound')
export const Users = make(UsersIcon, 'Users')
export const Wand2 = make(WandSparklesIcon, 'Wand2')
export const Waves = make(WavesIcon, 'Waves')
export const Workflow = make(WorkflowIcon, 'Workflow')
export const Wrench = make(WrenchIcon, 'Wrench')
export const X = make(XIcon, 'X')
export const Zap = make(ZapIcon, 'Zap')
export const ZoomIn = make(ZoomInIcon, 'ZoomIn')
export const ZoomOut = make(ZoomOutIcon, 'ZoomOut')
export const Circle = make(CircleIcon, 'Circle')
export const ChevronUp = make(ChevronUpIcon, 'ChevronUp')
