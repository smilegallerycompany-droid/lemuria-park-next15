"use client";

import { DEFAULT_REVIEWS, type GuestReview } from "@/lib/cms/defaults";

type Props = {
  reviews?: GuestReview[];
};

function Stars({ rating }: { rating: number }) {
  return (
    <span className="review-stars" aria-label={`${rating} из 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < rating ? "is-on" : "is-off"} aria-hidden>
          ★
        </span>
      ))}
    </span>
  );
}

export function ReviewsMarquee({ reviews = DEFAULT_REVIEWS }: Props) {
  if (reviews.length === 0) return null;
  const loop = [...reviews, ...reviews];

  return (
    <section id="reviews" className="reviews-marquee" aria-label="Отзывы">
      <div className="reviews-marquee-head">
        <span className="kicker">Отзывы</span>
      </div>
      <div className="reviews-marquee-viewport">
        <div className="reviews-marquee-track">
          {loop.map((review, index) => (
            <article className="review-chip" key={`${index}-${review.author}`}>
              <Stars rating={review.rating} />
              <p>{review.quote}</p>
              <footer>{review.author}</footer>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
