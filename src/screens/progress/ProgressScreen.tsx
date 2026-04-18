import { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { ScreenContainer } from '@/components/ScreenContainer';
import { Card } from '@/components/Card';
import { SectionHeader } from '@/components/SectionHeader';
import { Pill } from '@/components/Pill';
import { StatCard } from '@/components/StatCard';
import { colors, spacing, typography } from '@/theme';
import { mockProgress } from '@/data/mockProgress';

type Mode = 'workouts' | 'calories';

const { width } = Dimensions.get('window');
const CHART_WIDTH = width - spacing.lg * 2 - spacing.lg * 2;

export function ProgressScreen() {
  const [mode, setMode] = useState<Mode>('workouts');

  const oneRMData = mockProgress.estimated1RM.map((p) => ({
    value: p.value,
    label: p.date.slice(3),
  }));

  const caloriesData = mockProgress.dailyCalories.map((p) => ({
    value: p.value,
    label: p.date.slice(3),
  }));

  const volumeData = mockProgress.volumeByMuscle.map((v) => ({
    value: Math.round(v.volume / 1000),
    label: v.muscle.slice(0, 3),
    frontColor: colors.accent,
  }));

  return (
    <ScreenContainer scroll>
      <Text style={typography.heading}>Progress</Text>
      <Text style={[typography.bodyMuted, { marginTop: 4 }]}>
        14-day window. Tap modes to switch.
      </Text>

      <View style={styles.toggleRow}>
        <Pill
          label="Workouts"
          active={mode === 'workouts'}
          onPress={() => setMode('workouts')}
        />
        <Pill
          label="Calories"
          active={mode === 'calories'}
          onPress={() => setMode('calories')}
        />
      </View>

      <View style={styles.statRow}>
        {mode === 'workouts' ? (
          <>
            <StatCard
              label="Streak"
              value={mockProgress.currentStreak}
              unit="days"
              icon="flame"
              tone="accent"
            />
            <StatCard
              label="PRs · month"
              value={mockProgress.prsThisMonth}
              icon="trophy"
              tone="success"
            />
            <StatCard
              label="This week"
              value={mockProgress.daysTrainedThisWeek}
              unit="/ 4"
              icon="calendar"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Target"
              value={mockProgress.calorieTarget.toLocaleString()}
              unit="kcal"
              icon="flame"
              tone="accent"
            />
            <StatCard
              label="7d avg"
              value={Math.round(
                mockProgress.dailyCalories
                  .slice(-7)
                  .reduce((s, p) => s + p.value, 0) / 7
              ).toLocaleString()}
              unit="kcal"
              icon="stats-chart"
            />
            <StatCard
              label="Body"
              value={mockProgress.bodyweight[mockProgress.bodyweight.length - 1].value.toFixed(1)}
              unit="lbs"
              icon="body"
              tone="success"
            />
          </>
        )}
      </View>

      {mode === 'workouts' ? (
        <>
          <SectionHeader title="Estimated 1RM" subtitle="Bench press" />
          <Card>
            <LineChart
              data={oneRMData}
              width={CHART_WIDTH}
              height={180}
              thickness={3}
              color={colors.accent}
              dataPointsColor={colors.accent}
              hideDataPoints={false}
              yAxisColor="transparent"
              xAxisColor={colors.border}
              rulesColor={colors.border}
              rulesType="dashed"
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              curved
              initialSpacing={10}
              noOfSections={4}
              maxValue={Math.max(...oneRMData.map((d) => d.value)) + 10}
              yAxisOffset={Math.min(...oneRMData.map((d) => d.value)) - 10}
            />
          </Card>

          <SectionHeader title="Weekly volume" subtitle="Sets × reps × weight, by muscle (k lbs)" />
          <Card>
            <BarChart
              data={volumeData}
              width={CHART_WIDTH}
              height={180}
              barWidth={28}
              spacing={14}
              barBorderRadius={6}
              frontColor={colors.accent}
              yAxisColor="transparent"
              xAxisColor={colors.border}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              rulesColor={colors.border}
              rulesType="dashed"
              noOfSections={3}
            />
          </Card>
        </>
      ) : (
        <>
          <SectionHeader title="Daily calories" subtitle="Orange line = target" />
          <Card>
            <LineChart
              data={caloriesData}
              width={CHART_WIDTH}
              height={180}
              thickness={3}
              color={colors.success}
              dataPointsColor={colors.success}
              yAxisColor="transparent"
              xAxisColor={colors.border}
              rulesColor={colors.border}
              rulesType="dashed"
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              curved
              initialSpacing={10}
              showReferenceLine1
              referenceLine1Position={mockProgress.calorieTarget}
              referenceLine1Config={{
                color: colors.accent,
                dashWidth: 6,
                dashGap: 4,
                thickness: 2,
              }}
              maxValue={3200}
              yAxisOffset={2000}
              noOfSections={4}
            />
          </Card>

          <SectionHeader title="Bodyweight" />
          <Card>
            <LineChart
              data={mockProgress.bodyweight.map((p) => ({
                value: p.value,
                label: p.date.slice(3),
              }))}
              width={CHART_WIDTH}
              height={140}
              thickness={3}
              color={colors.warning}
              dataPointsColor={colors.warning}
              yAxisColor="transparent"
              xAxisColor={colors.border}
              rulesColor={colors.border}
              rulesType="dashed"
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              curved
              initialSpacing={10}
              noOfSections={3}
            />
          </Card>
        </>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});
