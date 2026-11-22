<script setup lang="ts">
defineProps<{ pg?: string; text?: string }>();
</script>

<template>
  <span class="pgz-ext" title="Not in Sequelize v6: a postgrelize extension"
    >{{ text ?? 'postgrelize extension' }}<template v-if="pg"> · PG {{ pg }}+</template></span
  >
</template>
