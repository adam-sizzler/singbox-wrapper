package db

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestDBStore_InitAndPragmas(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "singbox-db-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	store, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer store.Close()

	// Verify journal_mode is WAL
	var mode string
	if err := store.db.QueryRow("PRAGMA journal_mode;").Scan(&mode); err != nil {
		t.Fatalf("query journal_mode failed: %v", err)
	}
	if mode != "wal" {
		t.Fatalf("expected wal mode, got %s", mode)
	}
}

func TestDBStore_ProfileAndConfig(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "singbox-db-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "test.db")
	store, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer store.Close()

	// Save profile
	if err := store.SaveProfile("profile-alpha", "https://sub.example.com", "1.14.0", true); err != nil {
		t.Fatalf("SaveProfile failed: %v", err)
	}

	// Save profile config
	sampleConfig := `{"log":{"level":"info"},"inbounds":[],"outbounds":[]}`
	if err := store.SaveProfileConfig("profile-alpha", sampleConfig); err != nil {
		t.Fatalf("SaveProfileConfig failed: %v", err)
	}

	// Read profile config
	loadedCfg, err := store.GetProfileConfig("profile-alpha")
	if err != nil {
		t.Fatalf("GetProfileConfig failed: %v", err)
	}
	if loadedCfg != sampleConfig {
		t.Fatalf("expected %s, got %s", sampleConfig, loadedCfg)
	}

	// Read profiles
	profiles, err := store.GetProfiles()
	if err != nil {
		t.Fatalf("GetProfiles failed: %v", err)
	}
	if len(profiles) != 1 || profiles[0].Name != "profile-alpha" || profiles[0].IsActive != 1 {
		t.Fatalf("unexpected profiles: %+v", profiles)
	}
}

func TestDBStore_ProfileSubscription(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "singbox-db-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "sub_test.db")
	store, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer store.Close()

	sub := SubscriptionRecord{
		ProfileName:    "exodus",
		Title:          "Exodus",
		Announce:       "Привет мир",
		WebPageURL:     "https://exodus.test/sub",
		SupportURL:     "https://support.test",
		UpdateInterval: 12,
		Upload:         1000,
		Download:       5000,
		Total:          100000,
		Expire:         1890000000,
		RefillDate:     1800000000,
		LastUpdated:    1700000000,
		FileName:       "exodus.json",
	}

	if err := store.SaveProfileSubscription("exodus", sub); err != nil {
		t.Fatalf("SaveProfileSubscription failed: %v", err)
	}

	loaded, err := store.GetProfileSubscription("exodus")
	if err != nil {
		t.Fatalf("GetProfileSubscription failed: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected loaded subscription, got nil")
	}
	if loaded.Title != "Exodus" || loaded.Announce != "Привет мир" || loaded.Total != 100000 {
		t.Fatalf("unexpected loaded sub: %+v", loaded)
	}
}

func TestDBStore_ConcurrentStressAntiLock(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "singbox-db-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "stress.db")
	store, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("InitDB failed: %v", err)
	}
	defer store.Close()

	const goroutines = 20
	const iterations = 50

	var wg sync.WaitGroup
	wg.Add(goroutines)

	// Concurrently read and write from 20 parallel goroutines
	for i := 0; i < goroutines; i++ {
		go func(gID int) {
			defer wg.Done()
			pName := fmt.Sprintf("profile-%d", gID)
			for j := 0; j < iterations; j++ {
				// Write
				if err := store.SaveProfile(pName, "https://example.com", "latest", false); err != nil {
					t.Errorf("goroutine %d: write failed: %v", gID, err)
					return
				}
				if err := store.SetSetting(fmt.Sprintf("key_%d", gID), fmt.Sprintf("val_%d", j)); err != nil {
					t.Errorf("goroutine %d: set setting failed: %v", gID, err)
					return
				}
				// Read
				if _, _, err := store.GetSetting(fmt.Sprintf("key_%d", gID)); err != nil {
					t.Errorf("goroutine %d: read setting failed: %v", gID, err)
					return
				}
			}
		}(i)
	}

	wg.Wait()
}

func TestDBStore_ReopenExistingDB(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "singbox-db-test-reopen-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	dbPath := filepath.Join(tempDir, "reopen.db")
	store1, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("first InitDB failed: %v", err)
	}
	if err := store1.SetSetting("test_key", "test_val"); err != nil {
		t.Fatalf("SetSetting failed: %v", err)
	}
	if err := store1.Close(); err != nil {
		t.Fatalf("Close failed: %v", err)
	}

	// Reopen second time on existing DB file
	store2, err := InitDB(dbPath)
	if err != nil {
		t.Fatalf("second InitDB failed on existing database: %v", err)
	}
	defer store2.Close()

	val, ok, err := store2.GetSetting("test_key")
	if err != nil || !ok || val != "test_val" {
		t.Fatalf("expected test_val, got val=%s ok=%v err=%v", val, ok, err)
	}
}
