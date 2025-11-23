"""MIDI generation and processing service."""

import io
from pathlib import Path
from typing import Optional

import pretty_midi
from basic_pitch.inference import predict
from basic_pitch import ICASSP_2022_MODEL_PATH

from app.config import settings
from app.utils.logger import logger


class MidiService:
    """Service for MIDI file generation and processing."""
    
    def __init__(
        self,
        merge_note_gap: Optional[float] = None,
        uniform_velocity: Optional[int] = None,
        uniform_instrument: Optional[int] = None,
    ):
        """
        Initialize MIDI service.
        
        Args:
            merge_note_gap: Gap threshold for merging repeated notes (seconds)
            uniform_velocity: Uniform velocity for all notes (0-127)
            uniform_instrument: MIDI instrument program number (0-127)
        """
        self.merge_note_gap = merge_note_gap or settings.merge_note_gap_seconds
        self.uniform_velocity = uniform_velocity or settings.uniform_velocity
        self.uniform_instrument = uniform_instrument or settings.uniform_instrument
        
        logger.info(
            f"MidiService initialized: gap={self.merge_note_gap}s, "
            f"velocity={self.uniform_velocity}, instrument={self.uniform_instrument}"
        )
    
    def merge_repeated_notes(
        self,
        notes: list[pretty_midi.Note],
        max_gap: float,
    ) -> list[pretty_midi.Note]:
        """
        Merge consecutive notes of the same pitch if the gap between them is small.
        
        This function addresses the issue of rapid note repetitions that should be
        treated as a single sustained note.
        
        Args:
            notes: List of MIDI notes to process
            max_gap: Maximum gap (in seconds) between notes to merge
        
        Returns:
            List of merged notes
        """
        if not notes:
            return []
        
        # Sort notes by start time
        notes.sort(key=lambda n: n.start)
        
        merged_notes: list[pretty_midi.Note] = []
        current_merged_note = notes[0]
        
        for next_note in notes[1:]:
            # Check if notes have the same pitch
            is_same_pitch = next_note.pitch == current_merged_note.pitch
            
            # Calculate gap between current note end and next note start
            gap = next_note.start - current_merged_note.end
            is_close_gap = gap <= max_gap
            
            if is_same_pitch and is_close_gap:
                # Merge: extend the end time of current note
                current_merged_note.end = max(current_merged_note.end, next_note.end)
                # Take the higher velocity
                current_merged_note.velocity = max(
                    current_merged_note.velocity,
                    next_note.velocity
                )
                logger.debug(
                    f"Merged notes: pitch={current_merged_note.pitch}, "
                    f"gap={gap:.3f}s, new_duration={current_merged_note.end - current_merged_note.start:.3f}s"
                )
            else:
                # Don't merge: finalize current note and move to next
                merged_notes.append(current_merged_note)
                current_merged_note = next_note
        
        # Add the last note
        merged_notes.append(current_merged_note)
        
        return merged_notes
    
    def generate_midi_from_audio(
        self,
        audio_path: Path,
        output_dir: Path,
    ) -> Optional[Path]:
        """
        Generate a normalized MIDI file from an audio stem.
        
        This method:
        1. Uses Basic Pitch to transcribe audio to MIDI
        2. Merges rapid repeated notes
        3. Normalizes velocity and instrument
        4. Saves the processed MIDI file
        
        Args:
            audio_path: Path to the audio file to transcribe
            output_dir: Directory where MIDI file will be saved
        
        Returns:
            Path to the generated MIDI file, or None if generation failed
        """
        midi_file_name = audio_path.stem + '.mid'
        midi_output_path = output_dir / midi_file_name
        
        logger.info(f"Generating MIDI for: {audio_path.name}")
        
        try:
            # Run Basic Pitch prediction
            logger.debug(f"Running Basic Pitch prediction on {audio_path}")
            model_output, midi_data, note_events = predict(
                str(audio_path),
                ICASSP_2022_MODEL_PATH
            )
            
            # Convert to PrettyMIDI
            midi_buffer = io.BytesIO()
            midi_data.write(midi_buffer)
            midi_buffer.seek(0)
            pm = pretty_midi.PrettyMIDI(midi_buffer)
            
            total_notes_before = sum(len(inst.notes) for inst in pm.instruments)
            
            # Process each instrument
            for instrument in pm.instruments:
                if instrument.notes:
                    notes_before = len(instrument.notes)
                    
                    # Merge repeated notes
                    instrument.notes = self.merge_repeated_notes(
                        instrument.notes,
                        self.merge_note_gap
                    )
                    
                    notes_after = len(instrument.notes)
                    reduction = notes_before - notes_after
                    
                    logger.debug(
                        f"Merged notes for {audio_path.name}: "
                        f"{notes_before} → {notes_after} (reduced by {reduction})"
                    )
                
                # Normalize instrument and velocity
                instrument.program = self.uniform_instrument
                for note in instrument.notes:
                    note.velocity = self.uniform_velocity
            
            total_notes_after = sum(len(inst.notes) for inst in pm.instruments)
            
            # Save MIDI file
            pm.write(str(midi_output_path))
            
            logger.info(
                f"MIDI generated successfully: {midi_file_name} "
                f"(notes: {total_notes_before} → {total_notes_after})"
            )
            
            return midi_output_path
            
        except Exception as e:
            logger.error(f"Failed to generate MIDI for {audio_path.name}: {e}", exc_info=True)
            return None

    def combine_midis(
        self,
        midi_paths: list[Path],
        output_path: Path,
    ) -> Optional[Path]:
        """Combine multiple MIDI files into a single tracking file."""

        logger.info(f"Combining {len(midi_paths)} MIDI files into {output_path.name}")

        combined = pretty_midi.PrettyMIDI()
        instruments_combined = 0

        for midi_file in midi_paths:
            if not midi_file.exists():
                logger.warning(f"Skipping missing MIDI file: {midi_file}")
                continue

            try:
                segment = pretty_midi.PrettyMIDI(str(midi_file))
                for instrument in segment.instruments:
                    combined.instruments.append(instrument)
                instruments_combined += len(segment.instruments)
            except Exception as exc:
                logger.warning(
                    f"Failed to load MIDI {midi_file.name} for merge: {exc}",
                    exc_info=True
                )

        if instruments_combined == 0:
            logger.warning("No MIDI instruments found to combine")
            return None

        combined.write(str(output_path))
        logger.info(
            f"Unified MIDI created ({instruments_combined} instruments): {output_path.name}"
        )

        return output_path
