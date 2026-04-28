/**
 * Simple tracker to keep track of which data sources (Primary vs Replica)
 * are being hit in the current session/page.
 */

type DataSource = 'primary' | 'replica';

class DataSourceTracker {
  private activeSources = new Set<DataSource>();
  private listeners: ((sources: DataSource[]) => void)[] = [];

  notify(source: DataSource) {
    if (!this.activeSources.has(source)) {
      this.activeSources.add(source);
      this.emit();
      
      // Optional: Clear after some time if you want it to be "real-time activity"
      // or keep it for the session. Let's keep it for the session/view.
    }
  }

  getSources(): DataSource[] {
    return Array.from(this.activeSources);
  }

  subscribe(listener: (sources: DataSource[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit() {
    const sources = this.getSources();
    this.listeners.forEach(l => l(sources));
  }

  // Clear sources (useful on route changes if desired)
  clear() {
    this.activeSources.clear();
    this.emit();
  }
}

export const dataSourceTracker = new DataSourceTracker();
