<script lang="ts">
  let { title, stage }: { title: string; stage: number } = $props();
</script>

<h1>{title}</h1>
<div class="card">
  <p>This screen arrives in Stage {stage} of the build.</p>
  <p class="muted">The app shell is installed and works offline; features are added stage by stage.</p>
</div>
