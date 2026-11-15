// Package broker is a tiny generic in-process pub/sub used to fan out probe
// results to any number of Server-Sent-Events clients.
package broker

import "sync"

type Broker[T any] struct {
	mu   sync.RWMutex
	subs map[chan T]struct{}
}

func New[T any]() *Broker[T] {
	return &Broker[T]{subs: make(map[chan T]struct{})}
}

// Subscribe returns a buffered channel and an unsubscribe func.
func (b *Broker[T]) Subscribe(buffer int) (<-chan T, func()) {
	ch := make(chan T, buffer)
	b.mu.Lock()
	b.subs[ch] = struct{}{}
	b.mu.Unlock()
	return ch, func() {
		b.mu.Lock()
		if _, ok := b.subs[ch]; ok {
			delete(b.subs, ch)
			close(ch)
		}
		b.mu.Unlock()
	}
}

// Publish never blocks: a slow subscriber drops messages instead of
// stalling the scheduler (backpressure isolation).
func (b *Broker[T]) Publish(msg T) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for ch := range b.subs {
		select {
		case ch <- msg:
		default:
		}
	}
}

func (b *Broker[T]) Subscribers() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subs)
}
