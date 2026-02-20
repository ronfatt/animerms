import { prisma } from '../../prisma';
import type { StepInput } from '../types';

type Beat = {
  beat_no: number;
  purpose: string;
  t: [number, number];
  summary: string;
};

type Dialogue = {
  t_sec: number;
  line: string;
  subtitle: string;
};

function stageByEpisode(epNumber: number, totalEpisodes: number): string {
  const p = epNumber / Math.max(1, totalEpisodes);
  if (p <= 0.2) return 'awakening';
  if (p <= 0.45) return 'expansion';
  if (p <= 0.7) return 'collapse';
  if (p <= 0.9) return 'counterattack';
  return 'finale';
}

function pick<T>(arr: T[], idx: number): T {
  return arr[Math.abs(idx) % arr.length];
}

function normalizeLine(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function buildDialogues(input: {
  epNumber: number;
  stage: string;
  goal: string;
  obstacle: string;
  reveal: string;
}): Dialogue[] {
  const base = [
    `Dengar! Ombak bawa tanda baharu.`,
    `Kita tiada masa, gerak sekarang.`,
    `Jangan panik, ikut aku.`,
    `Musuh dekat, jangan pecah formasi.`,
    `Aku nampak jalan masuk.`,
    `Kalau gagal, kampung kita tenggelam.`,
    `Bukan nasib, ini perang.`,
    `Kau lindungi keluarga dulu.`,
    `Aku tarik perhatian mereka.`,
    `Roh laut mula bangun.`,
    `Kunci ada pada ${input.goal}.`,
    `Halangan utama: ${input.obstacle}.`,
    `Dengar baik, ${input.reveal}.`,
    `Kita ubah plan sekarang.`,
    `Aku takkan undur lagi.`,
    `Semua ikut isyarat tangan.`,
    `Ini belum tamat.`,
    `Malam ni kita balas semula.`
  ];

  return base.map((line, i) => ({
    t_sec: Math.min(118, 3 + i * 6),
    line: normalizeLine(line),
    subtitle: normalizeLine(line)
  }));
}

function buildBeats(input: {
  epNumber: number;
  stage: string;
  prevCliffhanger: string | null;
  goal: string;
  obstacle: string;
  reveal: string;
}): Beat[] {
  const prior = input.prevCliffhanger ? `Sambung dari cliffhanger: ${input.prevCliffhanger}.` : 'Permulaan konflik baharu.';
  const ranges: Array<[number, number]> = [
    [0, 12],
    [12, 24],
    [24, 36],
    [36, 48],
    [48, 60],
    [60, 74],
    [74, 88],
    [88, 102],
    [102, 112],
    [112, 120]
  ];
  const purposes = [
    'hook',
    'reaction',
    'setup',
    'plan',
    'decision',
    'escalation',
    'escalation',
    'setback',
    'twist',
    'cliffhanger'
  ];
  const summaries = [
    `${prior} Ancaman terus meletup di pesisir.`,
    `Hero dan pasukan respon pantas sambil selamatkan orang kampung.`,
    `Petunjuk baru muncul tentang ${input.goal}.`,
    `Mentor susun plan untuk tembus halangan ${input.obstacle}.`,
    `Hero pilih bertindak walaupun risiko tinggi.`,
    `Pertempuran memuncak, musuh tekan dari dua arah.`,
    `Keadaan makin berat, sumber makin habis.`,
    `Serangan balas gagal; pasukan hilang kelebihan.`,
    `Terbongkar rahsia: ${input.reveal}.`,
    `Penutup tegang: keputusan ekstrem bawa episod ke ${input.stage} seterusnya.`
  ];

  return ranges.map((t, i) => ({
    beat_no: i + 1,
    purpose: purposes[i],
    t,
    summary: summaries[i]
  }));
}

export async function script45sStep(input: StepInput): Promise<{ progress: number; message: string }> {
  const episode = await prisma.episode.findUnique({
    where: { id: input.episodeId },
    include: { series: true }
  });
  if (!episode) {
    throw new Error(`Episode ${input.episodeId.toString()} not found`);
  }

  const prev = episode.epNumber > 1
    ? await prisma.episode.findUnique({
        where: {
          seriesId_epNumber: {
            seriesId: episode.seriesId,
            epNumber: episode.epNumber - 1
          }
        },
        select: { script45s: true }
      })
    : null;

  const prevScript = (prev?.script45s ?? null) as
    | {
        cliffhanger?: string;
      }
    | null;
  const prevCliffhanger = typeof prevScript?.cliffhanger === 'string' ? prevScript.cliffhanger : null;

  const stage = stageByEpisode(episode.epNumber, episode.series.totalEpisodes);
  const goalPool = [
    'peta arus rahsia',
    'meterai batu karang purba',
    'kompas moyang Bajau',
    'laluan selamat kapal kampung'
  ];
  const obstaclePool = [
    'ribut palsu ciptaan musuh',
    'pengkhianat dalam rangkaian nelayan',
    'tenaga hero makin tidak stabil',
    'bekalan kapal hampir habis'
  ];
  const revealPool = [
    'musuh tahu asal kuasa hero',
    'mentor simpan rahsia tentang keluarga hero',
    'simbol tattoo hero sepadan dengan kuil tenggelam',
    'clan lama masih hidup di pulau terlarang'
  ];

  const epSeed = episode.epNumber * 37;
  const goal = pick(goalPool, epSeed + 1);
  const obstacle = pick(obstaclePool, epSeed + 2);
  const reveal = pick(revealPool, epSeed + 3);
  const cliffhanger = `EP${String(episode.epNumber).padStart(2, '0')}: ${pick(
    [
      'musuh utama muncul depan hero',
      'kapal utama disedut pusaran gelap',
      'ahli pasukan ditawan di menara air',
      'hero dengar suara purba panggil namanya'
    ],
    epSeed + 4
  )}`;

  const beats = buildBeats({
    epNumber: episode.epNumber,
    stage,
    prevCliffhanger,
    goal,
    obstacle,
    reveal
  });
  const dialogues = buildDialogues({
    epNumber: episode.epNumber,
    stage,
    goal,
    obstacle,
    reveal
  });

  const payload = {
    generated_at: new Date().toISOString(),
    duration_sec: 120,
    panel_count_target: 18,
    stage,
    episode_goal: goal,
    obstacle,
    reveal,
    continuity_from_prev: prevCliffhanger,
    beats,
    dialogues,
    cliffhanger
  };

  await prisma.episode.update({
    where: { id: input.episodeId },
    data: {
      script45s: payload,
      status: 'running',
      outline: {
        panelCount: 18,
        durationSec: 120
      }
    }
  });

  return { progress: 100, message: 'script_45s wrote 120s episodic story with continuity and 18 dialogue lines' };
}
