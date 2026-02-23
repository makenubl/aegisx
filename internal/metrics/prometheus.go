package metrics

import (
	"fmt"
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// AegisX Prometheus metrics registry.
var (
	// Policy operations
	PolicyApplyTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: "aegisx",
		Subsystem: "policy",
		Name:      "apply_total",
		Help:      "Total number of policy apply operations.",
	}, []string{"status"})

	PolicyApplyDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "aegisx",
		Subsystem: "policy",
		Name:      "apply_duration_seconds",
		Help:      "Duration of policy apply operations.",
		Buckets:   prometheus.DefBuckets,
	}, []string{"status"})

	// Firewall rule counts
	FirewallRulesActive = prometheus.NewGaugeVec(prometheus.GaugeOpts{
		Namespace: "aegisx",
		Subsystem: "firewall",
		Name:      "rules_active",
		Help:      "Number of active firewall rules.",
	}, []string{"chain"})

	FirewallRollbackTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Namespace: "aegisx",
		Subsystem: "firewall",
		Name:      "rollback_total",
		Help:      "Total number of automatic rollbacks.",
	})

	// IDS alerts
	IDSAlertsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: "aegisx",
		Subsystem: "ids",
		Name:      "alerts_total",
		Help:      "Total IDS/IPS alerts generated.",
	}, []string{"severity", "action"})

	// API request metrics
	APIRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Namespace: "aegisx",
		Subsystem: "api",
		Name:      "requests_total",
		Help:      "Total API requests.",
	}, []string{"method", "path", "status"})

	APIRequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Namespace: "aegisx",
		Subsystem: "api",
		Name:      "request_duration_seconds",
		Help:      "API request latency.",
		Buckets:   []float64{.005, .01, .025, .05, .1, .25, .5, 1, 2.5},
	}, []string{"method", "path"})

	// VPN connections
	VPNPeersConnected = prometheus.NewGauge(prometheus.GaugeOpts{
		Namespace: "aegisx",
		Subsystem: "vpn",
		Name:      "peers_connected",
		Help:      "Number of connected WireGuard peers.",
	})
)

func init() {
	prometheus.MustRegister(
		PolicyApplyTotal,
		PolicyApplyDuration,
		FirewallRulesActive,
		FirewallRollbackTotal,
		IDSAlertsTotal,
		APIRequestsTotal,
		APIRequestDuration,
		VPNPeersConnected,
	)
}

// Server exposes Prometheus metrics on a separate port.
type Server struct {
	port int
	path string
}

func NewServer(port int, path string) *Server {
	if path == "" {
		path = "/metrics"
	}
	return &Server{port: port, path: path}
}

func (s *Server) Start() error {
	mux := http.NewServeMux()
	mux.Handle(s.path, promhttp.Handler())
	return http.ListenAndServe(fmt.Sprintf(":%d", s.port), mux)
}
