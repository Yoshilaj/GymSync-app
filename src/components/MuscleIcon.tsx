import { View } from 'react-native';
import Svg, { Path, Circle, G, Ellipse } from 'react-native-svg';
import { colors } from '@/theme';
import { MuscleGroup } from '@/types';

interface Props {
  muscle: MuscleGroup;
  size?: number;
  background?: string;
}

const HL = colors.accent;
const BASE = '#CCD8E8';
const BASE_SOFT = '#E0E8F2';
const OUTLINE = '#8FA3BB';

type Side = 'front' | 'back';

const SIDE: Record<MuscleGroup, Side> = {
  Chest: 'front',
  Shoulders: 'front',
  Biceps: 'front',
  Triceps: 'back',
  Forearms: 'front',
  Abs: 'front',
  Quads: 'front',
  Hamstrings: 'back',
  Glutes: 'back',
  Calves: 'back',
  Adductors: 'front',
  Abductors: 'front',
  Traps: 'back',
  Lats: 'back',
  'Lower Back': 'back',
  'Full Body': 'front',
};

function fill(group: MuscleGroup, muscle: MuscleGroup): string {
  if (muscle === 'Full Body') return HL;
  return group === muscle ? HL : BASE;
}

export function MuscleIcon({ muscle, size = 40, background }: Props) {
  const side = SIDE[muscle];
  const w = size;
  const h = size;

  return (
    <View
      style={{
        width: w,
        height: h,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: background ?? 'transparent',
        borderRadius: size / 2,
      }}
    >
      <Svg width={w} height={h} viewBox="0 0 100 120">
        {side === 'front' ? <FrontBody muscle={muscle} /> : <BackBody muscle={muscle} />}
      </Svg>
    </View>
  );
}

function FrontBody({ muscle }: { muscle: MuscleGroup }) {
  return (
    <G>
      <Circle cx="50" cy="15" r="10" fill={BASE_SOFT} stroke={OUTLINE} strokeWidth="0.8" />
      <Path
        d="M38 26 Q50 24 62 26 L66 34 L74 36 L78 52 L72 56 L68 50 L68 74 Q68 94 64 108 L58 112 L56 88 L54 74 L46 74 L44 88 L42 112 L36 108 Q32 94 32 74 L32 50 L28 56 L22 52 L26 36 L34 34 Z"
        fill={BASE_SOFT}
        stroke={OUTLINE}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <Ellipse cx="30" cy="38" rx="7" ry="6" fill={fill('Shoulders', muscle)} />
      <Ellipse cx="70" cy="38" rx="7" ry="6" fill={fill('Shoulders', muscle)} />
      <Path
        d="M40 34 Q50 32 60 34 L62 46 Q50 49 38 46 Z"
        fill={fill('Chest', muscle)}
      />
      <Path
        d="M24 42 L28 56 L24 68 L20 56 Z"
        fill={fill('Biceps', muscle)}
      />
      <Path
        d="M76 42 L80 56 L76 68 L72 56 Z"
        fill={fill('Biceps', muscle)}
      />
      <Path
        d="M22 70 L26 82 L22 92 L18 82 Z"
        fill={fill('Forearms', muscle)}
      />
      <Path
        d="M78 70 L82 82 L78 92 L74 82 Z"
        fill={fill('Forearms', muscle)}
      />
      <Path
        d="M42 50 L58 50 L59 68 L41 68 Z"
        fill={fill('Abs', muscle)}
      />
      <Path
        d="M34 76 L46 76 L46 102 L38 104 Z"
        fill={fill('Quads', muscle)}
      />
      <Path
        d="M54 76 L66 76 L62 104 L54 102 Z"
        fill={fill('Quads', muscle)}
      />
      <Path
        d="M44 86 L46 76 L54 76 L56 86 L54 100 L46 100 Z"
        fill={muscle === 'Adductors' ? HL : muscle === 'Quads' ? HL : BASE}
        opacity={muscle === 'Adductors' ? 1 : 0}
      />
    </G>
  );
}

function BackBody({ muscle }: { muscle: MuscleGroup }) {
  return (
    <G>
      <Circle cx="50" cy="15" r="10" fill={BASE_SOFT} stroke={OUTLINE} strokeWidth="0.8" />
      <Path
        d="M38 26 Q50 24 62 26 L66 34 L74 36 L78 52 L72 56 L68 50 L68 74 Q68 94 64 108 L58 112 L56 88 L54 74 L46 74 L44 88 L42 112 L36 108 Q32 94 32 74 L32 50 L28 56 L22 52 L26 36 L34 34 Z"
        fill={BASE_SOFT}
        stroke={OUTLINE}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <Path
        d="M38 28 Q50 25 62 28 L58 38 Q50 36 42 38 Z"
        fill={fill('Traps', muscle)}
      />
      <Path
        d="M36 40 Q50 42 64 40 L66 62 Q50 66 34 62 Z"
        fill={fill('Lats', muscle)}
      />
      <Path
        d="M44 64 L56 64 L55 72 L45 72 Z"
        fill={fill('Lower Back', muscle)}
      />
      <Path
        d="M24 42 L28 56 L24 68 L20 56 Z"
        fill={fill('Triceps', muscle)}
      />
      <Path
        d="M76 42 L80 56 L76 68 L72 56 Z"
        fill={fill('Triceps', muscle)}
      />
      <Path
        d="M22 70 L26 82 L22 92 L18 82 Z"
        fill={fill('Forearms', muscle)}
      />
      <Path
        d="M78 70 L82 82 L78 92 L74 82 Z"
        fill={fill('Forearms', muscle)}
      />
      <Path
        d="M36 74 Q50 72 64 74 L62 84 Q50 86 38 84 Z"
        fill={fill('Glutes', muscle)}
      />
      <Path
        d="M36 86 L46 86 L44 104 L38 106 Z"
        fill={fill('Hamstrings', muscle)}
      />
      <Path
        d="M54 86 L64 86 L62 106 L56 104 Z"
        fill={fill('Hamstrings', muscle)}
      />
      <Path
        d="M38 108 L46 108 L45 118 L40 118 Z"
        fill={fill('Calves', muscle)}
      />
      <Path
        d="M54 108 L62 108 L60 118 L55 118 Z"
        fill={fill('Calves', muscle)}
      />
    </G>
  );
}
