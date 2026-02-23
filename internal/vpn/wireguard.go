// Package vpn manages WireGuard VPN peers and configuration.
package vpn

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net"
	"os"
	"os/exec"
	"strings"
	"text/template"

	"go.uber.org/zap"
	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"

	"github.com/aegisx/aegisx/internal/policy"
)

const wgConfigTemplate = `# WireGuard configuration — managed by AegisX
[Interface]
PrivateKey = {{ .PrivateKey }}
Address    = {{ .Address }}
ListenPort = {{ .ListenPort }}
{{ if .DNS }}DNS = {{ .DNS }}{{ end }}
PostUp   = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE
{{ range .Peers }}
[Peer]
# {{ .Name }}
PublicKey    = {{ .PublicKey }}
AllowedIPs   = {{ join .AllowedIPs ", " }}
{{ if .Endpoint }}Endpoint     = {{ .Endpoint }}{{ end }}
{{ if gt .KeepAlive 0 }}PersistentKeepalive = {{ .KeepAlive }}{{ end }}
{{ if .PresharedKey }}PresharedKey = {{ .PresharedKey }}{{ end }}
{{ end }}`

// Manager handles WireGuard configuration and peer management.
type Manager struct {
	iface      string
	configPath string
	log        *zap.Logger
}

func NewManager(iface, configPath string, log *zap.Logger) *Manager {
	return &Manager{iface: iface, configPath: configPath, log: log}
}

// GenerateKeyPair generates a new WireGuard private/public key pair.
func GenerateKeyPair() (privateKey, publicKey string, err error) {
	key, err := wgtypes.GeneratePrivateKey()
	if err != nil {
		return "", "", fmt.Errorf("generate private key: %w", err)
	}
	return key.String(), key.PublicKey().String(), nil
}

// GeneratePresharedKey generates a random 32-byte preshared key.
func GeneratePresharedKey() (string, error) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(key), nil
}

// Apply writes the WireGuard config and brings the interface up.
func (m *Manager) Apply(cfg *policy.CompiledVPNConfig) error {
	config, err := m.generate(cfg)
	if err != nil {
		return fmt.Errorf("generate config: %w", err)
	}

	if err := os.WriteFile(m.configPath, []byte(config), 0600); err != nil {
		return fmt.Errorf("write wg config: %w", err)
	}

	// Bring interface up / sync
	if m.isUp() {
		return m.syncConf()
	}
	return m.up()
}

// Status returns current WireGuard interface status.
func (m *Manager) Status() (*InterfaceStatus, error) {
	client, err := wgctrl.New()
	if err != nil {
		return nil, fmt.Errorf("wgctrl: %w", err)
	}
	defer client.Close()

	device, err := client.Device(m.iface)
	if err != nil {
		return nil, fmt.Errorf("get device %s: %w", m.iface, err)
	}

	status := &InterfaceStatus{
		Interface:  device.Name,
		PublicKey:  device.PublicKey.String(),
		ListenPort: device.ListenPort,
		Peers:      make([]PeerStatus, len(device.Peers)),
	}

	for i, p := range device.Peers {
		status.Peers[i] = PeerStatus{
			PublicKey:         p.PublicKey.String(),
			AllowedIPs:        ipNetSlice(p.AllowedIPs),
			LastHandshakeTime: p.LastHandshakeTime,
			RxBytes:           p.ReceiveBytes,
			TxBytes:           p.TransmitBytes,
		}
		if p.Endpoint != nil {
			status.Peers[i].Endpoint = p.Endpoint.String()
		}
	}
	return status, nil
}

// Down tears down the WireGuard interface.
func (m *Manager) Down() error {
	out, err := exec.Command("wg-quick", "down", m.iface).CombinedOutput()
	if err != nil {
		return fmt.Errorf("wg-quick down: %w (output: %s)", err, out)
	}
	return nil
}

// ─── Private helpers ──────────────────────────────────────────────────────

func (m *Manager) generate(cfg *policy.CompiledVPNConfig) (string, error) {
	funcMap := template.FuncMap{
		"join": strings.Join,
	}

	tmpl, err := template.New("wg").Funcs(funcMap).Parse(wgConfigTemplate)
	if err != nil {
		return "", err
	}

	var sb strings.Builder
	if err := tmpl.Execute(&sb, cfg); err != nil {
		return "", err
	}
	return sb.String(), nil
}

func (m *Manager) isUp() bool {
	out, err := exec.Command("ip", "link", "show", m.iface).Output()
	return err == nil && len(out) > 0
}

func (m *Manager) up() error {
	out, err := exec.Command("wg-quick", "up", m.configPath).CombinedOutput()
	if err != nil {
		return fmt.Errorf("wg-quick up: %w (output: %s)", err, out)
	}
	m.log.Info("WireGuard interface up", zap.String("iface", m.iface))
	return nil
}

func (m *Manager) syncConf() error {
	out, err := exec.Command("wg", "syncconf", m.iface, m.configPath).CombinedOutput()
	if err != nil {
		return fmt.Errorf("wg syncconf: %w (output: %s)", err, out)
	}
	m.log.Info("WireGuard config synced", zap.String("iface", m.iface))
	return nil
}

func ipNetSlice(nets []net.IPNet) []string {
	out := make([]string, len(nets))
	for i, n := range nets {
		out[i] = n.String()
	}
	return out
}

// ─── Status types ─────────────────────────────────────────────────────────

type InterfaceStatus struct {
	Interface  string
	PublicKey  string
	ListenPort int
	Peers      []PeerStatus
}

type PeerStatus struct {
	PublicKey         string
	Endpoint          string
	AllowedIPs        []string
	LastHandshakeTime interface{}
	RxBytes           int64
	TxBytes           int64
}
