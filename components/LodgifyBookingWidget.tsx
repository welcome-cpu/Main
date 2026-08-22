"use client";

import { useEffect } from "react";

const SCRIPT_SRC =
  "https://app.lodgify.com/book-now-box/stable/renderBookNowBox.js";
const LODGIFY_WEBSITE_ID = "561873";
const LODGIFY_SLUG = "gamriechalets";

export default function LodgifyBookingWidget({
  rentalId,
}: {
  rentalId: string;
}) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.defer = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, [rentalId]);

  return (
    <div>
      <style>{`
        :root {
          --ldg-bnb-background: #f5f2ec;
          --ldg-bnb-border-radius: 0.42em;
          --ldg-bnb-box-shadow: 0px 24px 54px 0px rgba(0, 0, 0, 0.1);
          --ldg-bnb-padding: 14px;
          --ldg-bnb-input-background: #ffffff;
          --ldg-bnb-button-border-radius: 0px;

          --ldg-bnb-color-primary: #374238;
          --ldg-bnb-color-primary-lighter: #9ba19c;
          --ldg-bnb-color-primary-darker: #1c211c;
          --ldg-bnb-color-primary-contrast: #f5f2ec;
          --ldg-component-calendar-cell-selection-bg-color: #374238;
          --ldg-component-calendar-cell-selection-color: #f5f2ec;
          --ldg-component-calendar-cell-selected-bg-color: #9ba19c;
          --ldg-component-calendar-cell-selected-color: #f5f2ec;
          --ldg-bnb-font-family: inherit;
        }
        #lodgify-book-now-box {
          width: 100%;
        }
      `}</style>
      <div
        id="lodgify-book-now-box"
        data-rental-id={rentalId}
        data-website-id={LODGIFY_WEBSITE_ID}
        data-slug={LODGIFY_SLUG}
        data-language-code="en"
        data-new-tab="true"
        data-version="stable"
        data-has-guests-breakdown="true"
        data-check-in-label="Check-in"
        data-check-out-label="Check-out"
        data-guests-label="Guests"
        data-guests-singular-label="{{NumberOfGuests}} guest"
        data-guests-plural-label="{{NumberOfGuests}} guests"
        data-location-input-label="Location"
        data-total-price-label="Total price:"
        data-select-dates-to-see-price-label="Select dates to see total price"
        data-minimum-price-per-night-first-label="From"
        data-minimum-price-per-night-second-label="per night"
        data-book-button-label="Book Now"
        data-guests-breakdown-label="Guests"
        data-adults-label='{"one":"adult","other":"adults"}'
        data-adults-description="Ages {minAge} or above"
        data-children-label='{"one":"child","other":"children"}'
        data-children-description="Ages {minAge}-{maxAge}"
        data-children-not-allowed-label="Not suitable for children"
        data-infants-label='{"one":"infant","other":"infants"}'
        data-infants-description="Under {maxAge}"
        data-infants-not-allowed-label="Not suitable for infants"
        data-pets-label='{"one":"pet","other":"pets"}'
        data-pets-not-allowed-label="Not allowed"
        data-done-label="Done"
      />
    </div>
  );
}
